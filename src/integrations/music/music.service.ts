import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudiusService } from '../audius/audius.service';
import { SpotifyService } from '../spotify/spotify.service';
import { YouTubeService } from '../youtube/youtube.service';
import type { MusicSearchResult } from './music.types';
import {
  mapAudius,
  mapSpotify,
  mapYouTube,
  type ProviderTrack,
} from './music-track-mappers';
import { MusicEnrichmentService } from './music-enrichment.service';
import {
  decodeMusicCursor,
  encodeMusicCursor,
  parseMusicOffset,
} from './music-search-cursor';

export const MUSIC_PROVIDER_KEY = 'MUSIC_PROVIDER';
export const MUSIC_PROVIDERS = ['YOUTUBE', 'AUDIUS', 'SPOTIFY'] as const;
export type MusicProvider = (typeof MUSIC_PROVIDERS)[number];
export const DEFAULT_MUSIC_PROVIDER: MusicProvider = 'AUDIUS';
const SPOTIFY_FALLBACK_STATUSES = new Set<number>([
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.TOO_MANY_REQUESTS,
  HttpStatus.BAD_GATEWAY,
  HttpStatus.SERVICE_UNAVAILABLE,
  HttpStatus.GATEWAY_TIMEOUT,
]);

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);

  constructor(
    private readonly audiusService: AudiusService,
    private readonly spotifyService: SpotifyService,
    private readonly youtubeService: YouTubeService,
    private readonly enrichment: MusicEnrichmentService,
    private readonly configService: ConfigService,
  ) {}

  async searchMusic(
    query: string,
    limit: number,
    cursor?: string,
  ): Promise<MusicSearchResult> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new BadRequestException('Search query cannot be empty');
    }

    const requestedProvider = this.getProvider();
    const providerCursor = decodeMusicCursor(cursor, requestedProvider);
    const result = await this.searchProvider(
      requestedProvider,
      normalizedQuery,
      limit,
      providerCursor,
    );
    const enrichedTracks = await this.enrichment.enrich(result.tracks);

    return {
      provider: result.provider,
      tracks: enrichedTracks,
      total: result.total,
      nextCursor: encodeMusicCursor(result.provider, result.nextCursor),
    };
  }

  private getProvider(): MusicProvider {
    const configured = this.configService
      .get<string>(MUSIC_PROVIDER_KEY)
      ?.trim()
      .toUpperCase();
    if (!configured) return DEFAULT_MUSIC_PROVIDER;
    if ((MUSIC_PROVIDERS as readonly string[]).includes(configured)) {
      return configured as MusicProvider;
    }
    this.logger.warn(
      `Unsupported MUSIC_PROVIDER="${configured}"; using ${DEFAULT_MUSIC_PROVIDER}`,
    );
    return DEFAULT_MUSIC_PROVIDER;
  }

  private async searchProvider(
    provider: MusicProvider,
    query: string,
    limit: number,
    cursor?: string,
  ): Promise<{
    provider: MusicProvider;
    tracks: ProviderTrack[];
    total: number;
    nextCursor: string | null;
  }> {
    if (provider === 'YOUTUBE') {
      const result = await this.youtubeService.searchMusic(
        query,
        limit,
        cursor,
      );
      return {
        provider: 'YOUTUBE',
        tracks: this.dedupeTracks(result.videos.map(mapYouTube)),
        total: result.total,
        nextCursor: result.nextPageToken,
      };
    }
    if (provider === 'SPOTIFY') {
      try {
        const result = await this.spotifyService.searchTracks(
          query,
          limit,
          parseMusicOffset(cursor),
        );
        return {
          provider: 'SPOTIFY',
          tracks: this.dedupeTracks(result.tracks.map(mapSpotify)),
          total: result.total,
          nextCursor:
            result.nextOffset == null ? null : String(result.nextOffset),
        };
      } catch (error) {
        if (cursor !== undefined || !this.canFallbackFromSpotify(error))
          throw error;
        this.logger.warn(
          JSON.stringify({
            event: 'music.provider_fallback',
            requestedProvider: 'SPOTIFY',
            fallbackProvider: DEFAULT_MUSIC_PROVIDER,
            statusCode: error.getStatus(),
          }),
        );
        return this.searchAudius(query, limit);
      }
    }
    return this.searchAudius(query, limit, cursor);
  }

  private async searchAudius(
    query: string,
    limit: number,
    cursor?: string,
  ): Promise<{
    provider: typeof DEFAULT_MUSIC_PROVIDER;
    tracks: ProviderTrack[];
    total: number;
    nextCursor: string | null;
  }> {
    const result = await this.audiusService.searchTracks(
      query,
      limit,
      parseMusicOffset(cursor),
    );
    return {
      provider: DEFAULT_MUSIC_PROVIDER,
      tracks: this.dedupeTracks(result.tracks.map(mapAudius)),
      total: result.total,
      nextCursor: result.nextOffset == null ? null : String(result.nextOffset),
    };
  }

  private canFallbackFromSpotify(error: unknown): error is HttpException {
    if (!(error instanceof HttpException)) return false;
    return SPOTIFY_FALLBACK_STATUSES.has(error.getStatus());
  }

  private dedupeTracks(tracks: ProviderTrack[]): ProviderTrack[] {
    const seen = new Set<string>();
    const unique: ProviderTrack[] = [];

    for (const track of tracks) {
      if (seen.has(track.id)) {
        continue;
      }
      seen.add(track.id);
      unique.push(track);
    }

    return unique;
  }
}
