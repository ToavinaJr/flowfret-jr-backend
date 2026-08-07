import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Prisma, Transcription, TranscriptionStatus } from '@prisma/client';
import type { Queue } from 'bullmq';
import { CreateTranscriptionDto } from './dto/create-transcription.dto';
import {
  DEFAULT_ENGINE_VERSION,
  MAX_RETRY_ATTEMPTS,
  TRANSCRIPTION_JOB,
  TRANSCRIPTION_QUEUE,
} from './transcriptions.constants';
import type {
  TranscriptionEvent,
  TranscriptionJobData,
  TranscriptionSegment,
} from './entities/transcription.types';
import { TranscriptionEvents } from './transcriptions.events';
import { TranscriptionsRepository } from './transcriptions.repository';
import { buildTranscriptionJobId } from './transcriptions.utils';

export interface TranscriptionResponse {
  transcriptionId: string;
  jobId: string | null;
  status: TranscriptionStatus;
  cached: boolean;
  readyToPlay: boolean;
  bufferedUntil: number;
  progress: number;
  segments: TranscriptionSegment[];
  language: string | null;
  detectedLanguage: string | null;
  lrcAvailable: boolean;
  error: { code: string; message: string } | null;
}

@Injectable()
export class TranscriptionsService {
  private readonly engineVersion: string;
  constructor(
    private readonly repository: TranscriptionsRepository,
    private readonly events: TranscriptionEvents,
    private readonly config: ConfigService,
    @InjectQueue(TRANSCRIPTION_QUEUE)
    private readonly queue: Queue<TranscriptionJobData>,
  ) {
    this.engineVersion =
      this.config.get<string>('WHISPER_ENGINE_VERSION') ??
      DEFAULT_ENGINE_VERSION;
  }

  async createOrGet(
    dto: CreateTranscriptionDto,
  ): Promise<TranscriptionResponse> {
    const language = dto.language ?? 'auto';
    let transcription = await this.repository.findCompatible(
      dto.trackId,
      language,
      dto.model,
      this.engineVersion,
    );
    let created = false;
    if (!transcription) {
      try {
        transcription = await this.repository.create({
          trackId: dto.trackId,
          title: dto.title,
          artist: dto.artist,
          requestedLanguage: language,
          model: dto.model,
          engineVersion: this.engineVersion,
        });
        created = true;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
        transcription = await this.repository.findCompatible(
          dto.trackId,
          language,
          dto.model,
          this.engineVersion,
        );
        if (!transcription) throw error;
      }
    }
    if (transcription.status === TranscriptionStatus.FAILED)
      return this.toResponse(transcription, null, false);
    if (transcription.status === TranscriptionStatus.COMPLETED)
      return this.toResponse(transcription, null, true);

    const jobId = buildTranscriptionJobId(
      dto.trackId,
      dto.language,
      dto.model,
      this.engineVersion,
    );
    const existingJob = await this.queue.getJob(jobId);
    if (!existingJob) {
      try {
        await this.queue.add(
          TRANSCRIPTION_JOB,
          {
            transcriptionId: transcription.id,
            trackId: dto.trackId,
            audioUrl: dto.audioUrl,
            language: dto.language,
            model: dto.model,
          },
          {
            jobId,
            attempts: this.numberConfig('TRANSCRIPTION_ATTEMPTS', 3),
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: { age: 3600, count: 100 },
            removeOnFail: { age: 86_400, count: 500 },
          },
        );
      } catch {
        throw new ServiceUnavailableException({
          code: 'REDIS_UNAVAILABLE',
          message: 'Transcription queue is unavailable',
        });
      }
    }
    if (created)
      this.events.emit({
        type: 'transcription.pending',
        transcriptionId: transcription.id,
        progress: 0,
        bufferedUntil: 0,
      });
    return this.toResponse(transcription, jobId, false);
  }

  async get(id: string): Promise<TranscriptionResponse> {
    const transcription = await this.requireOne(id);
    const jobId = buildTranscriptionJobId(
      transcription.trackId,
      transcription.requestedLanguage === 'auto'
        ? undefined
        : transcription.requestedLanguage,
      transcription.model,
      transcription.engineVersion,
    );
    return this.toResponse(
      transcription,
      transcription.status === TranscriptionStatus.COMPLETED ? null : jobId,
      transcription.status === TranscriptionStatus.COMPLETED,
    );
  }

  async getEventSnapshot(id: string): Promise<TranscriptionEvent> {
    const item = await this.requireOne(id);
    const type =
      item.status === TranscriptionStatus.COMPLETED
        ? 'transcription.completed'
        : item.status === TranscriptionStatus.FAILED
          ? 'transcription.failed'
          : item.readyToPlay
            ? 'transcription.ready-to-play'
            : 'transcription.progress';
    return {
      type,
      transcriptionId: id,
      progress: item.progress,
      bufferedUntil: item.bufferedUntil,
      readyToPlay: item.readyToPlay,
      errorCode: item.errorCode ?? undefined,
      message: item.errorMessage ?? undefined,
    };
  }

  async getLrc(id: string): Promise<{ content: string; filename: string }> {
    const item = await this.requireOne(id);
    if (!item.lrcContent)
      throw new ConflictException({
        code: 'TRANSCRIPTION_NOT_READY',
        message: 'LRC is not ready',
      });
    const safe =
      `${item.title ?? 'track'}-${item.artist ?? 'artist'}`
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 100) || 'transcription';
    return { content: item.lrcContent, filename: `${safe}.lrc` };
  }

  async retry(id: string, audioUrl: string): Promise<TranscriptionResponse> {
    const item = await this.requireOne(id);
    if (item.status !== TranscriptionStatus.FAILED)
      throw new ConflictException({
        code: 'TRANSCRIPTION_ALREADY_RUNNING',
        message: 'Only failed transcriptions can be retried',
      });
    if (item.attempts >= MAX_RETRY_ATTEMPTS)
      throw new ConflictException({
        code: 'TRANSCRIPTION_FAILED',
        message: 'Retry limit reached',
      });
    const reset = await this.repository.update(id, {
      status: TranscriptionStatus.PENDING,
      progress: 0,
      bufferedUntil: 0,
      readyToPlay: false,
      errorCode: null,
      errorMessage: null,
    });
    const requestedLanguage =
      item.requestedLanguage === 'auto' ? undefined : item.requestedLanguage;
    const jobId = `${buildTranscriptionJobId(item.trackId, requestedLanguage, item.model, item.engineVersion)}-retry-${item.attempts + 1}`;
    await this.queue.add(
      TRANSCRIPTION_JOB,
      {
        transcriptionId: id,
        trackId: item.trackId,
        audioUrl,
        language: requestedLanguage,
        model: item.model,
      },
      { jobId, attempts: 1, removeOnComplete: true },
    );
    return this.toResponse(reset, jobId, false);
  }

  private async requireOne(id: string): Promise<Transcription> {
    const item = await this.repository.findById(id);
    if (!item)
      throw new NotFoundException({
        code: 'TRANSCRIPTION_NOT_FOUND',
        message: 'Transcription not found',
      });
    return item;
  }
  private segments(value: Prisma.JsonValue | null): TranscriptionSegment[] {
    return Array.isArray(value)
      ? (value as unknown as TranscriptionSegment[])
      : [];
  }
  private toResponse(
    item: Transcription,
    jobId: string | null,
    cached: boolean,
  ): TranscriptionResponse {
    return {
      transcriptionId: item.id,
      jobId,
      status: item.status,
      cached,
      readyToPlay: item.readyToPlay,
      bufferedUntil: item.bufferedUntil,
      progress: item.progress,
      segments: this.segments(item.segments),
      language:
        item.requestedLanguage === 'auto' ? null : item.requestedLanguage,
      detectedLanguage: item.detectedLanguage,
      lrcAvailable: Boolean(item.lrcContent),
      error: item.errorCode
        ? {
            code: item.errorCode,
            message: item.errorMessage ?? 'Transcription failed',
          }
        : null,
    };
  }
  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
