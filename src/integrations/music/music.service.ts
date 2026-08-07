import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GENIUS_MAX_CONCURRENCY } from '../genius/genius.constants';
import { GeniusService } from '../genius/genius.service';
import { SpotifyService } from '../spotify/spotify.service';
import type { SpotifyTrack } from '../spotify/spotify.types';
import type { MusicSearchResult, MusicTrack } from './music.types';

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);

  constructor(
    private readonly spotifyService: SpotifyService,
    private readonly geniusService: GeniusService,
  ) {}

  async searchMusic(query: string, limit: number): Promise<MusicSearchResult> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new BadRequestException('Search query cannot be empty');
    }

    const spotifyResult = await this.spotifyService.searchTracks(
      normalizedQuery,
      limit,
    );

    const uniqueTracks = this.dedupeTracks(spotifyResult.tracks);
    const enrichedTracks = await this.enrichWithGenius(uniqueTracks);

    return {
      tracks: enrichedTracks,
      total: spotifyResult.total,
    };
  }

  private dedupeTracks(tracks: SpotifyTrack[]): SpotifyTrack[] {
    const seen = new Set<string>();
    const unique: SpotifyTrack[] = [];

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
    tracks: SpotifyTrack[],
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

  private async mapTrack(track: SpotifyTrack): Promise<MusicTrack> {
    const primaryArtist = track.artists[0]?.name ?? '';
    let geniusUrl: string | null = null;
    let geniusMatchScore: number | null = null;

    try {
      const geniusMatch = await this.geniusService.searchBestSong(
        track.name,
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

    const bestImage =
      track.album.images.find((image) => Boolean(image.url))?.url ?? null;

    return {
      spotifyId: track.id,
      title: track.name,
      artists: track.artists.map((artist) => ({
        id: artist.id,
        name: artist.name,
      })),
      albumId: track.album.id,
      albumName: track.album.name,
      imageUrl: bestImage,
      spotifyUrl: track.external_urls.spotify,
      previewUrl: track.preview_url,
      geniusUrl,
      geniusMatchScore,
      durationMs: track.duration_ms,
    };
  }
}
