import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { firstValueFrom } from 'rxjs';
import { AzureChatService } from '../../azure-openai/azure-chat.service';
import { AZURE_OPENAI_MAX_PAGE_TEXT_LENGTH } from '../../azure-openai/azure-openai.constants';
import { BingSearchService } from '../../web-search/bing-search.service';
import {
  LYRICS_GROUNDING_MIN_OVERLAP_RATIO,
  LYRICS_WEB_PAGE_TIMEOUT_MS,
  LYRICS_WEB_SEARCH_RESULT_COUNT,
  LYRICS_WEB_USER_AGENT,
} from '../lyrics.constants';
import type { LyricsProvider } from '../interfaces/lyrics-provider.interface';
import type { Lyrics, TrackMetadata } from '../interfaces/lyrics.interface';

/**
 * Last-resort lyrics provider: runs a real web search, fetches the real text
 * of a real page, and asks an LLM to extract (never generate) the lyrics
 * from that text. The grounding check in `isGrounded` is the actual safety
 * guarantee that the LLM didn't fall back to reciting lyrics from its own
 * training data — the extraction-only prompt alone isn't trustworthy enough.
 */
@Injectable()
export class LlmWebSearchLyricsProvider implements LyricsProvider {
  private readonly logger = new Logger(LlmWebSearchLyricsProvider.name);

  constructor(
    private readonly search: BingSearchService,
    private readonly chat: AzureChatService,
    private readonly http: HttpService,
  ) {}

  async findLyrics(track: TrackMetadata): Promise<Lyrics | null> {
    const results = await this.search.search(
      `${track.title} ${track.artist} lyrics`,
      LYRICS_WEB_SEARCH_RESULT_COUNT,
    );

    for (const result of results) {
      const pageText = await this.fetchPageText(result.url);
      if (!pageText) continue;

      const extracted = await this.chat.extractLyrics(pageText, track);
      if (!extracted) continue;

      if (!this.isGrounded(extracted, pageText)) {
        this.logger.warn(
          `Discarding ungrounded LLM lyrics extraction for ${track.artist} - ${track.title}`,
        );
        continue;
      }

      const lines = extracted
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length === 0) continue;

      this.logger.log(
        `Grounded web-search lyrics found for ${track.artist} - ${track.title}`,
      );
      return {
        provider: 'llm-web-search',
        synced: false,
        instrumental: false,
        plainLyrics: lines.join('\n'),
        lines: lines.map((text) => ({ startTimeMs: null, text })),
      };
    }

    return null;
  }

  private async fetchPageText(url: string): Promise<string | undefined> {
    try {
      const response = await firstValueFrom(
        this.http.get<string>(url, {
          headers: { 'User-Agent': LYRICS_WEB_USER_AGENT },
          timeout: LYRICS_WEB_PAGE_TIMEOUT_MS,
          responseType: 'text',
        }),
      );
      const $ = cheerio.load(response.data);
      $('script, style, nav, header, footer').remove();
      const text = $('body')
        .text()
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      return text
        ? text.slice(0, AZURE_OPENAI_MAX_PAGE_TEXT_LENGTH)
        : undefined;
    } catch {
      return undefined;
    }
  }

  private isGrounded(extracted: string, pageText: string): boolean {
    const extractedTokens = this.tokenize(extracted);
    if (extractedTokens.length === 0) return false;
    const pageTokens = new Set(this.tokenize(pageText));
    const matched = extractedTokens.filter((token) =>
      pageTokens.has(token),
    ).length;
    return (
      matched / extractedTokens.length >= LYRICS_GROUNDING_MIN_OVERLAP_RATIO
    );
  }

  private tokenize(value: string): string[] {
    return value
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/gu)
      .filter(Boolean);
  }
}
