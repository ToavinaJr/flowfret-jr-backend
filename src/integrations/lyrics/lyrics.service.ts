import { Injectable, Logger } from '@nestjs/common';
import {
  LYRICS_CACHE_TTL_SECONDS,
  LYRICS_NOT_FOUND_TTL_SECONDS,
} from './lyrics.constants';
import { LyricsCacheService } from './lyrics-cache.service';
import { buildLyricsCacheKey } from './lyrics-cache-key.util';
import { buildLyricsSearchCandidates } from './lyrics-search-candidates.util';
import { estimateLyricsTiming } from './estimate-lyrics-timing.util';
import type { Lyrics, TrackMetadata } from './interfaces/lyrics.interface';
import type { LyricsProvider } from './interfaces/lyrics-provider.interface';
import { LrclibProvider } from './providers/lrclib.provider';
import { GeniusLyricsProvider } from './providers/genius-lyrics.provider';
import { LyricsOverrideProvider } from './providers/lyrics-override.provider';
import { TononkiraLyricsProvider } from './providers/tononkira-lyrics.provider';
import { LlmWebSearchLyricsProvider } from './providers/llm-web-search-lyrics.provider';

@Injectable()
export class LyricsService {
  private readonly logger = new Logger(LyricsService.name);
  private readonly providers: readonly LyricsProvider[];

  constructor(
    private readonly override: LyricsOverrideProvider,
    lrclib: LrclibProvider,
    geniusLyrics: GeniusLyricsProvider,
    tononkiraLyrics: TononkiraLyricsProvider,
    llmWebSearchLyrics: LlmWebSearchLyricsProvider,
    private readonly cache: LyricsCacheService,
  ) {
    this.providers = [
      lrclib,
      geniusLyrics,
      tononkiraLyrics,
      llmWebSearchLyrics,
    ];
  }

  async findLyrics(track: TrackMetadata): Promise<Lyrics | null> {
    // Checked before the generic cache, keyed only by provider+trackId (a
    // single indexed Postgres lookup): an admin override must win the
    // instant it's saved, even if this exact track was already cached as
    // "not found" moments earlier (e.g. the search that led the admin to
    // add the override in the first place).
    const overrideResult = await this.override.findLyrics(track);
    if (overrideResult) return overrideResult;

    const key = buildLyricsCacheKey(track);
    const cached = await this.cache.get(key);
    if (cached !== undefined) {
      this.logger.log(`Lyrics cache hit (${key})`);
      return cached;
    }
    this.logger.log(`Lyrics cache miss (${key})`);
    for (const candidate of buildLyricsSearchCandidates(track)) {
      for (const provider of this.providers) {
        try {
          const result = await provider.findLyrics(candidate);
          if (result) {
            const normalized = this.estimateTimingIfUnsynced(result, track);
            await this.cache.set(key, normalized, LYRICS_CACHE_TTL_SECONDS);
            return normalized;
          }
        } catch (error) {
          this.logger.warn(
            `Lyrics provider failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }
      }
    }
    await this.cache.set(key, null, LYRICS_NOT_FOUND_TTL_SECONDS);
    return null;
  }

  /**
   * Genius, a plain-text-only LRCLIB submission and the LLM web-search
   * fallback never carry real per-line timing - only Tononkira estimates
   * it today, when a duration is known. Applying the same duration-weighted
   * estimate here, for any unsynced result, keeps playback consistent
   * (line-by-line highlighting) regardless of which provider answered,
   * instead of some tracks showing a single static block of text. It's
   * still an approximation, not true synchronization.
   */
  private estimateTimingIfUnsynced(
    result: Lyrics,
    track: TrackMetadata,
  ): Lyrics {
    if (result.synced || result.instrumental || !track.duration) {
      return result;
    }
    const texts =
      result.lines.length > 0
        ? result.lines.map((line) => line.text)
        : (result.plainLyrics ?? '')
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    if (texts.length === 0) return result;
    return {
      ...result,
      synced: true,
      lines: estimateLyricsTiming(texts, track.duration),
    };
  }
}
