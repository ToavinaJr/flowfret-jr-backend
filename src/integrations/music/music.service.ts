import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudiusService } from '../audius/audius.service';
import { GENIUS_MAX_CONCURRENCY } from '../genius/genius.constants';
import { GeniusService } from '../genius/genius.service';
import { SpotifyService } from '../spotify/spotify.service';
import { YouTubeService } from '../youtube/youtube.service';
import type { MusicSearchResult, MusicTrack } from './music.types';
import {
  mapAudius,
  mapSpotify,
  mapYouTube,
  type ProviderTrack,
} from './music-track-mappers';

export const MUSIC_PROVIDER_KEY = 'MUSIC_PROVIDER';
export const MUSIC_PROVIDERS = ['YOUTUBE', 'AUDIUS', 'SPOTIFY'] as const;
export type MusicProvider = (typeof MUSIC_PROVIDERS)[number];
export const DEFAULT_MUSIC_PROVIDER: MusicProvider = 'AUDIUS';

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);

  constructor(
    private readonly audiusService: AudiusService,
    private readonly spotifyService: SpotifyService,
    private readonly youtubeService: YouTubeService,
    private readonly geniusService: GeniusService,
    private readonly configService: ConfigService,
  ) {}

  async searchMusic(query: string, limit: number): Promise<MusicSearchResult> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new BadRequestException('Search query cannot be empty');
    }

    const provider = this.getProvider();
    const result = await this.searchProvider(provider, normalizedQuery, limit);
    const enrichedTracks = await this.enrichWithGenius(result.tracks);

    return {
      provider,
      tracks: enrichedTracks,
      total: result.total,
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
  ): Promise<{ tracks: ProviderTrack[]; total: number }> {
    if (provider === 'YOUTUBE') {
      const result = await this.youtubeService.searchMusic(query, limit);
      return {
        tracks: this.dedupeTracks(result.videos.map(mapYouTube)),
        total: result.total,
      };
    }
    if (provider === 'SPOTIFY') {
      const result = await this.spotifyService.searchTracks(query, limit);
      return {
        tracks: this.dedupeTracks(result.tracks.map(mapSpotify)),
        total: result.total,
      };
    }
    const result = await this.audiusService.searchTracks(query, limit);
    return {
      tracks: this.dedupeTracks(result.tracks.map(mapAudius)),
      total: result.total,
    };
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

  private async enrichWithGenius(
    tracks: ProviderTrack[],
  ): Promise<MusicTrack[]> {
    const results: MusicTrack[] = [];

    for (
      let index = 0;
      index < tracks.length;
      index += GENIUS_MAX_CONCURRENCY
    ) {
      const chunk = tracks.slice(index, index + GENIUS_MAX_CONCURRENCY);
      const mappedChunk = await Promise.all(
        chunk.map((track) => this.mapTrack(track)),
      );
      results.push(...mappedChunk);
    }

    return results;
  }

  private async mapTrack(track: ProviderTrack): Promise<MusicTrack> {
    const primaryArtist = track.artists[0]?.name ?? '';
    let geniusUrl: string | null = null;
    let geniusMatchScore: number | null = null;

    try {
      const geniusMatch = await this.geniusService.searchBestSong(
        track.title,
        primaryArtist,
      );
      if (geniusMatch) {
        geniusUrl = geniusMatch.url;
        geniusMatchScore = geniusMatch.matchScore;
      }
    } catch (error) {
      this.logger.warn(
        `Genius match failed for track ${track.id}: ${String(error)}`,
      );
    }

    return {
      provider: track.provider,
      id: track.id,
      audiusId: track.id,
      title: track.title,
      artists: track.artists,
      imageUrl: track.imageUrl,
      audiusUrl: track.externalUrl,
      externalUrl: track.externalUrl,
      album: track.album,
      isrc: track.isrc,
      streamUrl: track.streamUrl,
      genre: track.genre,
      geniusUrl,
      geniusMatchScore,
      durationMs: track.durationMs,
    };
  }
}
