import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GENIUS_MAX_CONCURRENCY } from '../genius/genius.constants';
import { GeniusService } from '../genius/genius.service';
import { YouTubeService } from '../youtube/youtube.service';
import type { YouTubeVideo } from '../youtube/youtube.types';
import type { MusicSearchResult, MusicTrack } from './music.types';

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);

  constructor(
    private readonly youtubeService: YouTubeService,
    private readonly geniusService: GeniusService,
  ) {}

  async searchMusic(query: string, limit: number): Promise<MusicSearchResult> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new BadRequestException('Search query cannot be empty');
    }

    const youtubeResult = await this.youtubeService.searchMusic(
      normalizedQuery,
      limit,
    );

    const uniqueTracks = this.dedupeTracks(youtubeResult.videos);
    const enrichedTracks = await this.enrichWithGenius(uniqueTracks);

    return {
      tracks: enrichedTracks,
      total: youtubeResult.total,
    };
  }

  private dedupeTracks(tracks: YouTubeVideo[]): YouTubeVideo[] {
    const seen = new Set<string>();
    const unique: YouTubeVideo[] = [];

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
    tracks: YouTubeVideo[],
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

  private async mapTrack(track: YouTubeVideo): Promise<MusicTrack> {
    const primaryArtist = track.channelTitle;
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
      youtubeId: track.id,
      title: track.title,
      artists: [{ id: track.channelId, name: track.channelTitle }],
      imageUrl: track.thumbnailUrl,
      youtubeUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(track.id)}`,
      geniusUrl,
      geniusMatchScore,
      durationMs: track.durationMs,
    };
  }
}
