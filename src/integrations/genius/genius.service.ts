import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { getRequiredConfig } from '../../common/required-config';
import {
  GENIUS_ACCESS_TOKEN_KEY,
  GENIUS_API_URL,
  GENIUS_CACHE_MAX_ENTRIES,
  GENIUS_CACHE_TTL_MS,
  GENIUS_HTTP_TIMEOUT_MS,
  GENIUS_MATCH_MIN_SCORE,
  GENIUS_NOISE_PHRASES,
  GENIUS_SEARCH_PATH,
} from './genius.constants';
import type {
  GeniusCacheEntry,
  GeniusSearchResponse,
  GeniusSongHit,
  GeniusSongMatch,
} from './genius.types';
import { describeError, similarity } from './genius-match.utils';

@Injectable()
export class GeniusService {
  private readonly logger = new Logger(GeniusService.name);
  private readonly cache = new Map<string, GeniusCacheEntry>();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async searchBestSong(
    title: string,
    artistName: string,
  ): Promise<GeniusSongMatch | null> {
    const cacheKey = this.buildCacheKey(title, artistName);
    const cached = this.getFromCache(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const hits = await this.searchSongs(`${title} ${artistName}`);
      const bestMatch = this.pickBestMatch(hits, title, artistName);
      this.setCache(cacheKey, bestMatch);
      return bestMatch;
    } catch (error) {
      this.logger.warn(
        `Genius enrichment skipped: ${describeError(error)}`,
      );
      return null;
    }
  }

  normalizeText(value: string): string {
    let normalized = value
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase();

    for (const phrase of GENIUS_NOISE_PHRASES) {
      normalized = normalized.replaceAll(phrase, ' ');
    }

    normalized = normalized
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return normalized;
  }

  computeMatchScore(
    spotifyTitle: string,
    spotifyArtist: string,
    geniusTitle: string,
    geniusArtist: string,
  ): number {
    const titleScore = similarity(
      this.normalizeText(spotifyTitle),
      this.normalizeText(geniusTitle),
    );
    const artistScore = similarity(
      this.normalizeText(spotifyArtist),
      this.normalizeText(geniusArtist),
    );
    return titleScore * 0.65 + artistScore * 0.35;
  }

  private async searchSongs(query: string): Promise<GeniusSongHit[]> {
    const accessToken = getRequiredConfig(
      this.configService,
      GENIUS_ACCESS_TOKEN_KEY,
    );

    const response = await firstValueFrom(
      this.httpService.get<GeniusSearchResponse>(
        `${GENIUS_API_URL}${GENIUS_SEARCH_PATH}`,
        {
          params: { q: query },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          timeout: GENIUS_HTTP_TIMEOUT_MS,
        },
      ),
    );

    return (response.data.response?.hits ?? [])
      .filter((hit) => hit.type === 'song')
      .map((hit) => hit.result);
  }

  private pickBestMatch(
    hits: GeniusSongHit[],
    title: string,
    artistName: string,
  ): GeniusSongMatch | null {
    let best: GeniusSongMatch | null = null;

    for (const hit of hits) {
      const matchScore = this.computeMatchScore(
        title,
        artistName,
        hit.title,
        hit.primary_artist.name,
      );

      if (matchScore < GENIUS_MATCH_MIN_SCORE) {
        continue;
      }

      if (!best || matchScore > best.matchScore) {
        best = {
          id: hit.id,
          title: hit.title,
          fullTitle: hit.full_title,
          url: hit.url,
          primaryArtistName: hit.primary_artist.name,
          thumbnailUrl: hit.song_art_image_thumbnail_url,
          matchScore,
        };
      }
    }

    return best;
  }

  private buildCacheKey(title: string, artistName: string): string {
    return `${this.normalizeText(title)}::${this.normalizeText(artistName)}`;
  }

  private getFromCache(key: string): GeniusSongMatch | null | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAtMs) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private setCache(key: string, value: GeniusSongMatch | null): void {
    this.evictExpired();
    if (this.cache.size >= GENIUS_CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, {
      value,
      expiresAtMs: Date.now() + GENIUS_CACHE_TTL_MS,
    });
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAtMs) {
        this.cache.delete(key);
      }
    }
  }

}
