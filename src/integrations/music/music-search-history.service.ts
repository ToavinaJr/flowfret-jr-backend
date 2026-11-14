import { Injectable, Logger } from '@nestjs/common';
import { MusicProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { MusicSearchResult } from './music.types';

@Injectable()
export class MusicSearchHistoryService {
  private readonly logger = new Logger(MusicSearchHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    userId: string,
    query: string,
    result: MusicSearchResult,
    limit: number,
  ): Promise<void> {
    try {
      await this.prisma.musicSearch.create({
        data: {
          userId,
          query: query.trim(),
          provider: result.provider as MusicProvider,
          resultLimit: limit,
          resultCount: result.tracks.length,
          results: {
            create: result.tracks.map((track, index) => ({
              position: index,
              provider: track.provider as MusicProvider,
              providerTrackId: track.providerTrackId,
              title: track.title,
              artists: track.artists as unknown as Prisma.InputJsonValue,
              album: track.album,
              durationMs: track.durationMs,
              metadata: {
                imageUrl: track.imageUrl,
                externalUrl: track.externalUrl,
                genre: track.genre,
                isrc: track.isrc,
                geniusUrl: track.geniusUrl,
                geniusMatchScore: track.geniusMatchScore,
              } as Prisma.InputJsonValue,
            })),
          },
        },
      });
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'music.search_history_record_failed',
          userId,
          error: error instanceof Error ? error.message : 'unknown_error',
        }),
      );
    }
  }
}
