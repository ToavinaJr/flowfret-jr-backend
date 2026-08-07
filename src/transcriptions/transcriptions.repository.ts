import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Transcription, TranscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TranscriptionSegment } from './entities/transcription.types';

@Injectable()
export class TranscriptionsRepository {
  private readonly logger = new Logger(TranscriptionsRepository.name);
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.timeoutMs = Number(
      config.get('TRANSCRIPTION_DATABASE_TIMEOUT_MS') ?? 15_000,
    );
  }

  findById(id: string): Promise<Transcription | null> {
    return this.execute('findById', () =>
      this.prisma.transcription.findUnique({ where: { id } }),
    );
  }
  findCompatible(
    trackId: string,
    requestedLanguage: string,
    model: string,
    engineVersion: string,
  ): Promise<Transcription | null> {
    return this.execute('findCompatible', () =>
      this.prisma.transcription.findUnique({
        where: {
          trackId_requestedLanguage_model_engineVersion: {
            trackId,
            requestedLanguage,
            model,
            engineVersion,
          },
        },
      }),
    );
  }
  create(data: {
    trackId: string;
    title?: string;
    artist?: string;
    requestedLanguage: string;
    model: string;
    engineVersion: string;
  }): Promise<Transcription> {
    return this.execute('create', () =>
      this.prisma.transcription.create({ data }),
    );
  }
  update(
    id: string,
    data: Prisma.TranscriptionUpdateInput,
  ): Promise<Transcription> {
    return this.execute('update', () =>
      this.prisma.transcription.update({ where: { id }, data }),
    );
  }
  saveSegments(
    id: string,
    segments: readonly TranscriptionSegment[],
    bufferedUntil: number,
    progress: number,
  ): Promise<Transcription> {
    return this.update(id, {
      segments: segments as unknown as Prisma.InputJsonValue,
      bufferedUntil,
      progress,
    });
  }
  markFailed(
    id: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<Transcription> {
    return this.update(id, {
      status: TranscriptionStatus.FAILED,
      errorCode,
      errorMessage: errorMessage.slice(0, 1000),
    });
  }

  private async execute<T>(
    operation: string,
    query: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    this.logger.debug(
      JSON.stringify({ event: 'database.query_started', operation }),
    );
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
          event: 'database.query_completed',
          operation,
          elapsedMs: Date.now() - startedAt,
        }),
      );
      return result;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'database.query_failed',
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
          code: 'DATABASE_UNAVAILABLE',
          message: 'The transcription database did not respond in time',
        });
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
