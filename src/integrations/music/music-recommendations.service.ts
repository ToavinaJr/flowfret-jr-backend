import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ListeningHistoryService } from './listening-history.service';
import { MusicService } from './music.service';
import type { MusicTrack } from './music.types';

interface WeightedSignal {
  label: string;
  weight: number;
}

@Injectable()
export class MusicRecommendationsService {
  private readonly logger = new Logger(MusicRecommendationsService.name);

  constructor(
    private readonly listeningHistory: ListeningHistoryService,
    private readonly music: MusicService,
  ) {}

  async forUser(userId: string, take = 12): Promise<MusicTrack[]> {
    const [seeds, savedOrPlayedTrackKeys] = await Promise.all([
      this.listeningHistory.recommendationSeeds(userId),
      this.listeningHistory.savedOrPlayedTrackKeys(userId),
    ]);
    if (!seeds.length) return [];

    const heardTracks = new Set(savedOrPlayedTrackKeys);
    const genreWeights = new Map<string, WeightedSignal>();
    const artistWeights = new Map<string, WeightedSignal>();

    for (const seed of seeds) {
      const weight = seed.isFavorite ? 3 : 1;
      const genre = seed.genre?.trim();
      if (genre) this.addWeight(genreWeights, genre, weight);
      for (const artist of seed.artists) {
        if (artist.trim()) this.addWeight(artistWeights, artist, weight);
      }
    }

    const topGenres = this.topSignals(genreWeights, 3);
    const topArtists = this.topSignals(artistWeights, topGenres.length ? 1 : 3);
    const queries = [...topGenres, ...topArtists];
    if (!queries.length) return [];

    const results = await Promise.allSettled(
      queries.map(({ label }) => this.music.searchMusic(label, 12)),
    );
    if (results.every((result) => result.status === 'rejected')) {
      this.logger.warn(
        'All catalog searches failed while generating recommendations',
      );
      throw new ServiceUnavailableException(
        'Recommendations are temporarily unavailable',
      );
    }
    const candidates = new Map<
      string,
      { track: MusicTrack; score: number; order: number }
    >();
    let order = 0;

    for (const [queryIndex, result] of results.entries()) {
      if (result.status !== 'fulfilled') continue;
      const queryWeight = queries[queryIndex]?.weight ?? 0;
      for (const track of result.value.tracks) {
        order += 1;
        const key = `${track.provider}:${track.providerTrackId}`;
        if (heardTracks.has(key)) continue;

        const genreWeight = track.genre
          ? (genreWeights.get(track.genre.trim().toLocaleLowerCase())?.weight ??
            0)
          : 0;
        const artistWeight = track.artists.reduce(
          (total, artist) =>
            total +
            (artistWeights.get(artist.name.trim().toLocaleLowerCase())
              ?.weight ?? 0),
          0,
        );
        const score = genreWeight * 2 + artistWeight || queryWeight * 0.25;
        const existing = candidates.get(key);
        if (!existing || score > existing.score) {
          candidates.set(key, { track, score, order });
        }
      }
    }

    return [...candidates.values()]
      .sort(
        (left, right) => right.score - left.score || left.order - right.order,
      )
      .slice(0, Math.min(24, Math.max(1, take)))
      .map(({ track }) => track);
  }

  private addWeight(
    signals: Map<string, WeightedSignal>,
    label: string,
    weight: number,
  ): void {
    const key = label.toLocaleLowerCase();
    const existing = signals.get(key);
    signals.set(key, {
      label: existing?.label ?? label,
      weight: (existing?.weight ?? 0) + weight,
    });
  }

  private topSignals(
    signals: Map<string, WeightedSignal>,
    limit: number,
  ): WeightedSignal[] {
    return [...signals.values()]
      .sort(
        (left, right) =>
          right.weight - left.weight || left.label.localeCompare(right.label),
      )
      .slice(0, limit);
  }
}
