import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  LYRICS_CACHE_TTL_SECONDS,
  LYRICS_NOT_FOUND_TTL_SECONDS,
} from './lyrics.constants';
import { LyricsCacheService } from './lyrics-cache.service';
import type { Lyrics, TrackMetadata } from './interfaces/lyrics.interface';
import type { LyricsProvider } from './interfaces/lyrics-provider.interface';
import { LrclibProvider } from './providers/lrclib.provider';

@Injectable()
export class LyricsService {
  private readonly logger = new Logger(LyricsService.name);
  private readonly providers: readonly LyricsProvider[];

  constructor(
    lrclib: LrclibProvider,
    private readonly cache: LyricsCacheService,
  ) {
    this.providers = [lrclib];
  }

  async findLyrics(track: TrackMetadata): Promise<Lyrics | null> {
    const key = this.cacheKey(track);
    const cached = await this.cache.get(key);
    if (cached !== undefined) {
      this.logger.log(`Lyrics cache hit (${key})`);
      return cached;
    }
    this.logger.log(`Lyrics cache miss (${key})`);
    for (const provider of this.providers) {
      try {
        const result = await provider.findLyrics(track);
        if (result) {
          await this.cache.set(key, result, LYRICS_CACHE_TTL_SECONDS);
          return result;
        }
      } catch (error) {
        this.logger.warn(
          `Lyrics provider failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
    await this.cache.set(key, null, LYRICS_NOT_FOUND_TTL_SECONDS);
    return null;
  }

  private cacheKey(track: TrackMetadata): string {
    const identity = [
      track.provider,
      track.id,
      track.artist,
      track.title,
      track.duration,
    ]
      .filter((value) => value !== undefined && value !== '')
      .map((value) =>
        String(value)
          .normalize('NFKD')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim(),
      )
      .join('|');
    return `lyrics:${createHash('sha256').update(identity).digest('hex')}`;
  }
}
