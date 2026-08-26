import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudiusService } from '../audius/audius.service';
import { AUDIUS_API_URL, AUDIUS_WEB_URL } from '../audius/audius.constants';
import type { AudiusTrack } from '../audius/audius.types';
import { GENIUS_MAX_CONCURRENCY } from '../genius/genius.constants';
import { GeniusService } from '../genius/genius.service';
import { SpotifyService } from '../spotify/spotify.service';
import type { SpotifyTrack } from '../spotify/spotify.types';
import { YouTubeService } from '../youtube/youtube.service';
import type { YouTubeVideo } from '../youtube/youtube.types';
import type { MusicSearchResult, MusicTrack } from './music.types';

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
        tracks: this.dedupeTracks(result.videos.map(this.mapYouTube)),
        total: result.total,
      };
    }
    if (provider === 'SPOTIFY') {
      const result = await this.spotifyService.searchTracks(query, limit);
      return {
        tracks: this.dedupeTracks(result.tracks.map(this.mapSpotify)),
        total: result.total,
      };
    }
    const result = await this.audiusService.searchTracks(query, limit);
    return {
      tracks: this.dedupeTracks(result.tracks.map(this.mapAudius)),
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

  private readonly mapAudius = (track: AudiusTrack): ProviderTrack => ({
    provider: 'AUDIUS',
    id: track.id,
    title: track.title,
    artists: [{ id: track.user.id, name: track.user.name }],
    imageUrl: this.pickArtwork(track),
    externalUrl: this.buildAudiusUrl(track.permalink),
    streamUrl: `${AUDIUS_API_URL}/tracks/${encodeURIComponent(track.id)}/stream`,
    genre: track.genre ?? null,
    album: null,
    isrc: null,
    durationMs: Math.max(0, Math.round(track.duration * 1000)),
  });

  private readonly mapSpotify = (track: SpotifyTrack): ProviderTrack => ({
    provider: 'SPOTIFY',
    id: track.id,
    title: track.name,
    artists: track.artists,
    imageUrl: track.album.images[0]?.url ?? null,
    externalUrl: track.external_urls.spotify,
    streamUrl: track.preview_url ?? track.external_urls.spotify,
    genre: null,
    album: track.album.name || null,
    isrc: track.external_ids?.isrc ?? null,
    durationMs: Math.max(0, track.duration_ms),
  });

  private readonly mapYouTube = (video: YouTubeVideo): ProviderTrack => ({
    provider: 'YOUTUBE',
    id: video.id,
    title: video.title,
    artists: [{ id: video.channelId, name: video.channelTitle }],
    imageUrl: video.thumbnailUrl,
    externalUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
    streamUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
    genre: null,
    album: null,
    isrc: null,
    durationMs: Math.max(0, video.durationMs),
  });

  private pickArtwork(track: AudiusTrack): string | null {
    const artwork = track.artwork;
    return (
      artwork?.['_1000x1000'] ??
      artwork?.['1000x1000'] ??
      artwork?.['_480x480'] ??
      artwork?.['480x480'] ??
      artwork?.['_150x150'] ??
      artwork?.['150x150'] ??
      null
    );
  }

  private buildAudiusUrl(permalink?: string): string {
    if (!permalink) return AUDIUS_WEB_URL;
    if (/^https?:\/\//i.test(permalink)) return permalink;
    return `${AUDIUS_WEB_URL}/${permalink.replace(/^\/+/, '')}`;
  }
}

interface ProviderTrack {
  provider: MusicProvider;
  id: string;
  title: string;
  artists: Array<{ id: string; name: string }>;
  imageUrl: string | null;
  externalUrl: string;
  streamUrl: string;
  genre: string | null;
  album: string | null;
  isrc: string | null;
  durationMs: number;
}
