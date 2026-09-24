import { Injectable, Logger } from '@nestjs/common';
import { GENIUS_MAX_CONCURRENCY } from '../genius/genius.constants';
import { GeniusService } from '../genius/genius.service';
import type { ProviderTrack } from './music-track-mappers';
import type { MusicTrack } from './music.types';

@Injectable()
export class MusicEnrichmentService {
  private readonly logger = new Logger(MusicEnrichmentService.name);

  constructor(private readonly genius: GeniusService) {}

  async enrich(tracks: ProviderTrack[]): Promise<MusicTrack[]> {
    const results: MusicTrack[] = [];
    for (
      let index = 0;
      index < tracks.length;
      index += GENIUS_MAX_CONCURRENCY
    ) {
      results.push(
        ...(await Promise.all(
          tracks
            .slice(index, index + GENIUS_MAX_CONCURRENCY)
            .map((track) => this.map(track)),
        )),
      );
    }
    return results;
  }

  private async map(track: ProviderTrack): Promise<MusicTrack> {
    let geniusUrl: string | null = null;
    let geniusMatchScore: number | null = null;
    try {
      const match = await this.genius.searchBestSong(
        track.title,
        track.artists[0]?.name ?? '',
      );
      geniusUrl = match?.url ?? null;
      geniusMatchScore = match?.matchScore ?? null;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'music.enrichment_failed',
          provider: track.provider,
          providerTrackId: track.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
    }
    return {
      provider: track.provider,
      id: track.id,
      providerTrackId: track.id,
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
