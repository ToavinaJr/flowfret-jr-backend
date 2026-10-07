import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudioStem, MusicProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STEMS_ERROR_CODE } from './stems.constants';

@Injectable()
export class StemsRepository {
  private readonly logger = new Logger(StemsRepository.name);
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.timeoutMs = Number(
      config.get('TRANSCRIPTION_DATABASE_TIMEOUT_MS') ?? 15_000,
    );
  }

  findById(id: string): Promise<AudioStem | null> {
    return this.execute('findById', () =>
      this.prisma.audioStem.findUnique({ where: { id } }),
    );
  }

  findCompatible(
    provider: MusicProvider,
    trackId: string,
    engineVersion: string,
  ): Promise<AudioStem | null> {
    return this.execute('findCompatible', () =>
      this.prisma.audioStem.findUnique({
        where: {
          provider_trackId_engineVersion: { provider, trackId, engineVersion },
        },
      }),
    );
  }

  create(data: {
    provider: MusicProvider;
    trackId: string;
    title?: string;
    artist?: string;
    engineVersion: string;
  }): Promise<AudioStem> {
    return this.execute('create', () => this.prisma.audioStem.create({ data }));
  }

  update(id: string, data: Prisma.AudioStemUpdateInput): Promise<AudioStem> {
    return this.execute('update', () =>
      this.prisma.audioStem.update({ where: { id }, data }),
    );
  }

  claimPending(id: string): Promise<boolean> {
    return this.execute('claimPending', async () => {
      const result = await this.prisma.audioStem.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'DOWNLOADING', attempts: { increment: 1 } },
      });
      return result.count > 0;
    });
  }

  markFailed(
    id: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<AudioStem> {
    return this.update(id, {
      status: 'FAILED',
      errorCode,
      errorMessage: errorMessage.slice(0, 1000),
    });
  }

  private async execute<T>(
    operation: string,
    query: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        query(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Database operation timed out')),
            this.timeoutMs,
          );
        }),
      ]);
      this.logger.log(
        JSON.stringify({
          event: 'audio_stems.database.query_completed',
          operation,
          elapsedMs: Date.now() - startedAt,
        }),
      );
      return result;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'audio_stems.database.query_failed',
          operation,
          elapsedMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      if (
        error instanceof Error &&
        error.message === 'Database operation timed out'
      )
        throw new ServiceUnavailableException({
          code: STEMS_ERROR_CODE.DATABASE_UNAVAILABLE,
          message: 'The audio stem database did not respond in time',
        });
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
