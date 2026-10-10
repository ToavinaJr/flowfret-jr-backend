import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import { firstValueFrom } from 'rxjs';
import { estimateLyricsTiming } from '../estimate-lyrics-timing.util';
import {
  LYRICS_WEB_PAGE_TIMEOUT_MS,
  LYRICS_WEB_USER_AGENT,
} from '../lyrics.constants';
import type { LyricsProvider } from '../interfaces/lyrics-provider.interface';
import type { Lyrics, TrackMetadata } from '../interfaces/lyrics.interface';

const TONONKIRA_BASE_URL = 'https://tononkira.serasera.org';

/**
 * Dedicated source for Malagasy ("gasy") lyrics, which LRCLIB/Genius rarely
 * cover. URLs are guessed deterministically from the artist/title
 * (https://tononkira.serasera.org/hira/{artist-slug}/{title-slug}); a wrong
 * guess just 404s like any other miss, so no "is this Malagasy" detection
 * is needed up front.
 *
 * The site injects hidden "honeypot" spans (aria-hidden, display:none) full
 * of random characters into the lyrics text to poison naive copy/paste or
 * scraping — they're stripped before reading the text. The lyrics container
 * itself has a page-specific, unpredictable id, but it reliably sits right
 * after the "(Nalaina tao amin'ny tononkira.serasera.org)" print byline, so
 * that DOM relationship is used instead of the id.
 */
@Injectable()
export class TononkiraLyricsProvider implements LyricsProvider {
  private readonly logger = new Logger(TononkiraLyricsProvider.name);

  constructor(private readonly http: HttpService) {}

  async findLyrics(track: TrackMetadata): Promise<Lyrics | null> {
    const artistSlug = this.slugify(track.artist);
    const titleSlug = this.slugify(track.title);
    if (!artistSlug || !titleSlug) return null;

    const url = `${TONONKIRA_BASE_URL}/hira/${artistSlug}/${titleSlug}`;
    try {
      const response = await firstValueFrom(
        this.http.get<string>(url, {
          headers: { 'User-Agent': LYRICS_WEB_USER_AGENT },
          timeout: LYRICS_WEB_PAGE_TIMEOUT_MS,
          responseType: 'text',
        }),
      );
      const lines = this.extractLines(response.data);
      if (lines.length === 0) return null;
      this.logger.log(
        `Tononkira lyrics found for ${track.artist} - ${track.title}`,
      );
      const synced = typeof track.duration === 'number' && track.duration > 0;
      return {
        provider: 'tononkira',
        synced,
        instrumental: false,
        plainLyrics: lines.join('\n'),
        lines: synced
          ? estimateLyricsTiming(lines, track.duration as number)
          : lines.map((text) => ({ startTimeMs: null, text })),
      };
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        // Expected: this track just isn't on Tononkira.
      } else if (error instanceof AxiosError && error.code === 'ECONNABORTED') {
        this.logger.warn('Tononkira request timeout');
      } else {
        this.logger.warn(
          `Tononkira request failed (status=${error instanceof AxiosError ? (error.response?.status ?? 'network') : 'invalid'})`,
        );
      }
      return null;
    }
  }

  private extractLines(html: string): string[] {
    const $ = cheerio.load(html);
    $('[aria-hidden="true"]').remove();
    const container = $('div.print.fst-italic').next('div');
    if (container.length === 0) return [];
    container.find('br').replaceWith('\n');
    return container
      .text()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
