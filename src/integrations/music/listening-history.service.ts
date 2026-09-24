import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RecordTrackListenInput } from './listening-history.types';
import { MusicTrack } from './music.types';

@Injectable()
export class ListeningHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async record(userId: string, input: RecordTrackListenInput): Promise<boolean> {
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
    await this.prisma.listeningHistory.upsert({
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
    });
    return true;
  }

  async list(userId: string, take: number): Promise<MusicTrack[]> {
    const rows = await this.prisma.listeningHistory.findMany({
      where: { userId },
      orderBy: { lastPlayedAt: 'desc' },
      take: Math.min(50, Math.max(1, take)),
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

  private readArtists(value: Prisma.JsonValue): Array<{ id: string; name: string }> {
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
