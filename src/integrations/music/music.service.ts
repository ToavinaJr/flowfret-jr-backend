import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AudiusService } from '../audius/audius.service';
import { AUDIUS_API_URL, AUDIUS_WEB_URL } from '../audius/audius.constants';
import type { AudiusTrack } from '../audius/audius.types';
import { GENIUS_MAX_CONCURRENCY } from '../genius/genius.constants';
import { GeniusService } from '../genius/genius.service';
import type { MusicSearchResult, MusicTrack } from './music.types';

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);

  constructor(
    private readonly audiusService: AudiusService,
    private readonly geniusService: GeniusService,
  ) {}

  async searchMusic(query: string, limit: number): Promise<MusicSearchResult> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new BadRequestException('Search query cannot be empty');
    }

    const audiusResult = await this.audiusService.searchTracks(
      normalizedQuery,
      limit,
    );

    const uniqueTracks = this.dedupeTracks(audiusResult.tracks);
    const enrichedTracks = await this.enrichWithGenius(uniqueTracks);

    return {
      tracks: enrichedTracks,
      total: audiusResult.total,
    };
  }

  private dedupeTracks(tracks: AudiusTrack[]): AudiusTrack[] {
    const seen = new Set<string>();
    const unique: AudiusTrack[] = [];

    for (const track of tracks) {
      if (seen.has(track.id)) {
        continue;
      }
      seen.add(track.id);
      unique.push(track);
    }

    return unique;
  }

  private async enrichWithGenius(tracks: AudiusTrack[]): Promise<MusicTrack[]> {
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

  private async mapTrack(track: AudiusTrack): Promise<MusicTrack> {
    const primaryArtist = track.user.name;
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
      audiusId: track.id,
      title: track.title,
      artists: [{ id: track.user.id, name: track.user.name }],
      imageUrl: this.pickArtwork(track),
      audiusUrl: this.buildAudiusUrl(track.permalink),
      // Keep the public API endpoint in the browser instead of a short-lived
      // signed storage-node URL. Audius can then select a fresh node on every
      // load/retry.
      streamUrl: `${AUDIUS_API_URL}/tracks/${encodeURIComponent(track.id)}/stream`,
      genre: track.genre ?? null,
      geniusUrl,
      geniusMatchScore,
      durationMs: Math.max(0, Math.round(track.duration * 1000)),
    };
  }

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
