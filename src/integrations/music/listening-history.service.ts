import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RecordTrackListenInput } from './listening-history.types';
import { MusicTrack } from './music.types';

@Injectable()
export class ListeningHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    userId: string,
    input: RecordTrackListenInput,
  ): Promise<boolean> {
    const providerTrackId = input.providerTrackId.trim();
    const snapshot = {
      title: input.title.trim(),
      artists: input.artists.map((artist) => ({
        id: artist.id.trim(),
        name: artist.name.trim(),
      })) as unknown as Prisma.InputJsonValue,
      imageUrl: input.imageUrl ?? null,
      externalUrl: input.externalUrl,
      streamUrl: input.streamUrl,
      album: input.album?.trim() || null,
      genre: input.genre?.trim() || null,
      isrc: input.isrc?.trim() || null,
      durationMs: input.durationMs,
      lastPlayedAt: new Date(),
    };
    await this.prisma.$transaction([
      this.prisma.listeningHistory.upsert({
        where: {
          userId_provider_providerTrackId: {
            userId,
            provider: input.provider,
            providerTrackId,
          },
        },
        update: { ...snapshot, playCount: { increment: 1 } },
        create: {
          userId,
          provider: input.provider,
          providerTrackId,
          ...snapshot,
        },
      }),
      this.prisma.listeningHistoryEvent.create({
        data: { userId, provider: input.provider, providerTrackId },
      }),
    ]);
    return true;
  }

  async statistics(userId: string) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - 29);
    const [aggregate, repeatedTracks, dailyRows] = await Promise.all([
      this.prisma.listeningHistory.aggregate({
        where: { userId, playCount: { gt: 0 } },
        _sum: { playCount: true },
        _count: { _all: true },
      }),
      this.prisma.listeningHistory.count({
        where: { userId, playCount: { gt: 1 } },
      }),
      this.prisma.$queryRaw<Array<{ date: Date; listens: number }>>`
        SELECT date_trunc('day', played_at) AS date, COUNT(*)::int AS listens
        FROM listening_history_events
        WHERE user_id = ${userId}::uuid AND played_at >= ${start}
        GROUP BY date_trunc('day', played_at)
        ORDER BY date ASC
      `,
    ]);
    const dailyCounts = new Map(
      dailyRows.map((row) => [
        row.date.toISOString().slice(0, 10),
        row.listens,
      ]),
    );
    const daily = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      return { date: key, listens: dailyCounts.get(key) ?? 0 };
    });
    const totalPlays = aggregate._sum.playCount ?? 0;
    return {
      totalPlays,
      repeatedTracks,
      repeatPlays: Math.max(0, totalPlays - aggregate._count._all),
      daily,
    };
  }

  async setFavorite(
    userId: string,
    input: RecordTrackListenInput,
    favorite: boolean,
  ): Promise<boolean> {
    const providerTrackId = input.providerTrackId.trim();
    const where = {
      userId_provider_providerTrackId: {
        userId,
        provider: input.provider,
        providerTrackId,
      },
    };
    if (!favorite) {
      await this.prisma.listeningHistory.updateMany({
        where: { userId, provider: input.provider, providerTrackId },
        data: { isFavorite: false },
      });
      return false;
    }

    const snapshot = {
      title: input.title.trim(),
      artists: input.artists.map((artist) => ({
        id: artist.id.trim(),
        name: artist.name.trim(),
      })) as unknown as Prisma.InputJsonValue,
      imageUrl: input.imageUrl ?? null,
      externalUrl: input.externalUrl,
      streamUrl: input.streamUrl,
      album: input.album?.trim() || null,
      genre: input.genre?.trim() || null,
      isrc: input.isrc?.trim() || null,
      durationMs: input.durationMs,
      isFavorite: true,
    };
    await this.prisma.listeningHistory.upsert({
      where,
      update: snapshot,
      create: {
        userId,
        provider: input.provider,
        providerTrackId,
        ...snapshot,
        playCount: 0,
      },
    });
    return true;
  }

  async listFavorites(
    userId: string,
    take = 50,
    skip = 0,
  ): Promise<MusicTrack[]> {
    const rows = await this.prisma.listeningHistory.findMany({
      where: { userId, isFavorite: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: Math.min(100, Math.max(1, take)),
      skip: Math.max(0, skip),
    });
    return rows.map((row) => ({
      provider: row.provider,
      id: row.providerTrackId,
      providerTrackId: row.providerTrackId,
      audiusId: row.providerTrackId,
      title: row.title,
      artists: this.readArtists(row.artists),
      imageUrl: row.imageUrl,
      audiusUrl: row.externalUrl,
      externalUrl: row.externalUrl,
      album: row.album,
      isrc: row.isrc,
      streamUrl: row.streamUrl,
      genre: row.genre,
      geniusUrl: null,
      geniusMatchScore: null,
      durationMs: row.durationMs,
    }));
  }

  async list(userId: string, take: number, skip = 0): Promise<MusicTrack[]> {
    const rows = await this.prisma.listeningHistory.findMany({
      where: { userId, playCount: { gt: 0 } },
      orderBy: { lastPlayedAt: 'desc' },
      take: Math.min(50, Math.max(1, take)),
      skip: Math.max(0, skip),
    });
    return rows.map((row) => ({
      provider: row.provider,
      id: row.providerTrackId,
      providerTrackId: row.providerTrackId,
      audiusId: row.providerTrackId,
      title: row.title,
      artists: this.readArtists(row.artists),
      imageUrl: row.imageUrl,
      audiusUrl: row.externalUrl,
      externalUrl: row.externalUrl,
      album: row.album,
      isrc: row.isrc,
      streamUrl: row.streamUrl,
      genre: row.genre,
      geniusUrl: null,
      geniusMatchScore: null,
      durationMs: row.durationMs,
    }));
  }

  async recommendationSeeds(
    userId: string,
    take = 30,
  ): Promise<
    Array<{
      provider: string;
      providerTrackId: string;
      genre: string | null;
      artists: string[];
      isFavorite: boolean;
    }>
  > {
    const rows = await this.prisma.listeningHistory.findMany({
      where: { userId, OR: [{ isFavorite: true }, { playCount: { gt: 0 } }] },
      orderBy: [{ isFavorite: 'desc' }, { lastPlayedAt: 'desc' }],
      take: Math.min(50, Math.max(1, take)),
      select: {
        provider: true,
        providerTrackId: true,
        genre: true,
        artists: true,
        isFavorite: true,
      },
    });
    return rows.map((row) => ({
      provider: row.provider,
      providerTrackId: row.providerTrackId,
      genre: row.genre,
      artists: this.readArtists(row.artists).map((artist) => artist.name),
      isFavorite: row.isFavorite,
    }));
  }

  async savedOrPlayedTrackKeys(userId: string): Promise<string[]> {
    const rows = await this.prisma.listeningHistory.findMany({
      where: { userId, OR: [{ isFavorite: true }, { playCount: { gt: 0 } }] },
      select: { provider: true, providerTrackId: true },
    });
    return rows.map((row) => `${row.provider}:${row.providerTrackId}`);
  }

  async trending(take = 10): Promise<MusicTrack[]> {
    const rankings = await this.prisma.listeningHistory.groupBy({
      by: ['provider', 'providerTrackId'],
      _sum: { playCount: true },
      orderBy: [{ _sum: { playCount: 'desc' } }, { providerTrackId: 'asc' }],
      take: Math.min(50, Math.max(1, take * 5)),
    });
    const playedRankings = rankings
      .filter((ranking) => (ranking._sum.playCount ?? 0) > 0)
      .slice(0, take);
    if (!playedRankings.length) return [];

    const rows = await this.prisma.listeningHistory.findMany({
      where: {
        OR: playedRankings.map(({ provider, providerTrackId }) => ({
          provider,
          providerTrackId,
        })),
      },
      orderBy: { lastPlayedAt: 'desc' },
    });
    const snapshots = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const key = `${row.provider}:${row.providerTrackId}`;
      if (!snapshots.has(key)) snapshots.set(key, row);
    }

    return playedRankings.flatMap(({ provider, providerTrackId }) => {
      const row = snapshots.get(`${provider}:${providerTrackId}`);
      if (!row) return [];
      return [
        {
          provider: row.provider,
          id: row.providerTrackId,
          providerTrackId: row.providerTrackId,
          audiusId: row.providerTrackId,
          title: row.title,
          artists: this.readArtists(row.artists),
          imageUrl: row.imageUrl,
          audiusUrl: row.externalUrl,
          externalUrl: row.externalUrl,
          album: row.album,
          isrc: row.isrc,
          streamUrl: row.streamUrl,
          genre: row.genre,
          geniusUrl: null,
          geniusMatchScore: null,
          durationMs: row.durationMs,
        },
      ];
    });
  }

  private readArtists(
    value: Prisma.JsonValue,
  ): Array<{ id: string; name: string }> {
    if (!Array.isArray(value)) return [];
    return value.flatMap((artist) => {
      if (
        typeof artist !== 'object' ||
        artist === null ||
        Array.isArray(artist) ||
        typeof artist.id !== 'string' ||
        typeof artist.name !== 'string'
      )
        return [];
      return [{ id: artist.id, name: artist.name }];
    });
  }
}
