import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import { firstValueFrom } from 'rxjs';
import { GeniusService } from '../../genius/genius.service';
import {
  GENIUS_LYRICS_PAGE_TIMEOUT_MS,
  GENIUS_LYRICS_USER_AGENT,
} from '../lyrics.constants';
import type { LyricsProvider } from '../interfaces/lyrics-provider.interface';
import type { Lyrics, TrackMetadata } from '../interfaces/lyrics.interface';

@Injectable()
export class GeniusLyricsProvider implements LyricsProvider {
  private readonly logger = new Logger(GeniusLyricsProvider.name);

  constructor(
    private readonly genius: GeniusService,
    private readonly http: HttpService,
  ) {}

  async findLyrics(track: TrackMetadata): Promise<Lyrics | null> {
    const match = await this.genius.searchBestSong(track.title, track.artist);
    if (!match) return null;

    try {
      const response = await firstValueFrom(
        this.http.get<string>(match.url, {
          headers: { 'User-Agent': GENIUS_LYRICS_USER_AGENT },
          timeout: GENIUS_LYRICS_PAGE_TIMEOUT_MS,
          responseType: 'text',
        }),
      );
      const lines = this.extractLines(response.data);
      if (lines.length === 0) return null;
      this.logger.log(
        `Genius lyrics found for ${track.artist} - ${track.title}`,
      );
      return {
        provider: 'genius',
        synced: false,
        instrumental: false,
        plainLyrics: lines.join('\n'),
        lines: lines.map((text) => ({ startTimeMs: null, text })),
      };
    } catch (error) {
      if (error instanceof AxiosError && error.code === 'ECONNABORTED')
        this.logger.warn('Genius lyrics page timeout');
      else
        this.logger.warn(
          `Genius lyrics page request failed (status=${error instanceof AxiosError ? (error.response?.status ?? 'network') : 'invalid'})`,
        );
      return null;
    }
  }

  private extractLines(html: string): string[] {
    const $ = cheerio.load(html);
    const containers = $('div[data-lyrics-container="true"]');
    if (containers.length === 0) return [];

    const text = containers
      .toArray()
      .map((container) => {
        const node = $(container);
        node.find('br').replaceWith('\n');
        return node.text();
      })
      .join('\n');

    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }
}
