import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
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
  processingPhase: string | null;
  error: { code: string; message: string } | null;
}

@Injectable()
export class TranscriptionsService {
  private readonly logger = new Logger(TranscriptionsService.name);
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
    if (typeof this.queue.on === 'function')
      this.queue.on('error', (error) =>
        this.logger.error(
          JSON.stringify({
            event: 'transcription.queue_error',
            error: this.errorMessage(error),
          }),
        ),
      );
  }

  async createOrGet(
    dto: CreateTranscriptionDto,
    userId: string,
  ): Promise<TranscriptionResponse> {
    const language = dto.language ?? 'auto';
    this.logger.log(
      JSON.stringify({
        event: 'transcription.requested',
        trackId: dto.trackId,
        language,
        model: dto.model,
      }),
    );
    let transcription = await this.repository.findCompatible(
      dto.trackId,
      language,
      dto.model,
      this.engineVersion,
    );
    let created = false;
    if (!transcription) {
      await this.ensureCapacity(userId);
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
      this.logger.warn(
        JSON.stringify({
          event: 'transcription.reused_failed',
          transcriptionId: transcription.id,
          trackId: dto.trackId,
          errorCode: transcription.errorCode,
        }),
      );
    await this.repository.grantAccess(userId, transcription.id);
    if (transcription.status === TranscriptionStatus.FAILED)
      return this.toResponse(transcription, null, false);
    if (transcription.status === TranscriptionStatus.COMPLETED) {
      this.logger.log(
        JSON.stringify({
          event: 'transcription.cache_hit',
          transcriptionId: transcription.id,
          trackId: dto.trackId,
        }),
      );
      return this.toResponse(transcription, null, true);
    }

    const jobId = buildTranscriptionJobId(
      dto.trackId,
      dto.language,
      dto.model,
      this.engineVersion,
    );
    const existingJob = await this.queueOperation(
      'getJob',
      this.queue.getJob(jobId),
    );
    if (!existingJob) {
      try {
        await this.queueOperation(
          'add',
          this.queue.add(
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
          ),
        );
        this.logger.log(
          JSON.stringify({
            event: 'transcription.enqueued',
            transcriptionId: transcription.id,
            trackId: dto.trackId,
            jobId,
          }),
        );
      } catch (error) {
        this.logger.error(
          JSON.stringify({
            event: 'transcription.enqueue_failed',
            transcriptionId: transcription.id,
            trackId: dto.trackId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        throw new ServiceUnavailableException({
          code: 'REDIS_UNAVAILABLE',
          message: 'Transcription queue is unavailable',
        });
      }
    } else {
      const jobState =
        typeof existingJob.getState === 'function'
          ? await existingJob.getState()
          : 'unknown';
      this.logger.log(
        JSON.stringify({
          event: 'transcription.job_reused',
          transcriptionId: transcription.id,
          trackId: dto.trackId,
          jobId,
          jobState,
        }),
      );
    }
    await this.logQueueDiagnostics(transcription.id);
    if (created)
      this.events.emit({
        type: 'transcription.pending',
        transcriptionId: transcription.id,
        progress: 0,
        bufferedUntil: 0,
      });
    return this.toResponse(transcription, jobId, false);
  }

  async get(id: string, userId: string): Promise<TranscriptionResponse> {
    const transcription = await this.requireOne(id, userId);
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

  async getEventSnapshot(
    id: string,
    userId: string,
  ): Promise<TranscriptionEvent> {
    const item = await this.requireOne(id, userId);
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
      processingPhase: item.processingPhase ?? undefined,
      errorCode: item.errorCode ?? undefined,
      message: item.errorMessage ?? undefined,
    };
  }

  async getLrc(
    id: string,
    userId: string,
  ): Promise<{ content: string; filename: string }> {
    const item = await this.requireOne(id, userId);
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

  async retry(
    id: string,
    audioUrl: string,
    userId: string,
  ): Promise<TranscriptionResponse> {
    const item = await this.requireOne(id, userId);
    if (item.status !== TranscriptionStatus.FAILED)
      throw new ConflictException({
        code: 'TRANSCRIPTION_ALREADY_RUNNING',
        message: 'Only failed transcriptions can be retried',
      });
    if (item.manualRetryCount >= MAX_RETRY_ATTEMPTS)
      throw new ConflictException({
        code: 'TRANSCRIPTION_FAILED',
        message: 'Retry limit reached',
      });
    const reset = await this.repository.update(id, {
      status: TranscriptionStatus.PENDING,
      progress: 0,
      bufferedUntil: 0,
      readyToPlay: false,
      manualRetryCount: { increment: 1 },
      processingPhase: 'AUDIO_PREPARING',
      errorCode: null,
      errorMessage: null,
    });
    const requestedLanguage =
      item.requestedLanguage === 'auto' ? undefined : item.requestedLanguage;
    const jobId = `${buildTranscriptionJobId(item.trackId, requestedLanguage, item.model, item.engineVersion)}-retry-${item.manualRetryCount + 1}`;
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
    this.logger.log(
      JSON.stringify({
        event: 'transcription.retry_enqueued',
        transcriptionId: id,
        trackId: item.trackId,
        jobId,
      }),
    );
    await this.logQueueDiagnostics(id);
    return this.toResponse(reset, jobId, false);
  }

  async diagnostics(): Promise<Record<string, unknown>> {
    const checkedAt = new Date().toISOString();
    const configuration = {
      provider: this.config.get<string>('LLM_PROVIDER') ?? 'whisper',
      model: this.config.get<string>('WHISPER_MODEL') ?? 'small',
      concurrency: this.numberConfig('TRANSCRIPTION_CONCURRENCY', 1),
    };
    const diagnosticQueue = this.queue as Queue<TranscriptionJobData> & {
      getJobCounts?: Queue<TranscriptionJobData>['getJobCounts'];
      getWorkers?: Queue<TranscriptionJobData>['getWorkers'];
    };
    if (
      typeof diagnosticQueue.getJobCounts !== 'function' ||
      typeof diagnosticQueue.getWorkers !== 'function'
    ) {
      return {
        queue: TRANSCRIPTION_QUEUE,
        status: 'QUEUE_UNAVAILABLE',
        queueHealthy: false,
        available: false,
        workerCount: null,
        configuration,
        checkedAt,
      };
    }
    const [counts, workers] = await Promise.all([
      this.queueOperation(
        'diagnosticJobCounts',
        diagnosticQueue.getJobCounts(
          'waiting',
          'active',
          'delayed',
          'completed',
          'failed',
          'paused',
        ),
      ),
      this.queueOperation('diagnosticWorkers', diagnosticQueue.getWorkers()),
    ]);
    const workerCount = workers.length;
    return {
      queue: TRANSCRIPTION_QUEUE,
      status: workerCount > 0 ? 'READY' : 'NO_WORKER',
      queueHealthy: true,
      counts,
      workerCount,
      configuration,
      workers: workers.map((worker) => ({
        id: worker.id,
        name: worker.name,
        addr: worker.addr,
      })),
      checkedAt,
    };
  }

  private async logQueueDiagnostics(transcriptionId: string): Promise<void> {
    try {
      const diagnostics = await this.diagnostics();
      const workerCount =
        typeof diagnostics.workerCount === 'number'
          ? diagnostics.workerCount
          : null;
      const payload = JSON.stringify({
        event: 'transcription.queue_diagnostics',
        transcriptionId,
        ...diagnostics,
      });
      if (workerCount === 0) this.logger.warn(payload);
      else this.logger.log(payload);
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'transcription.queue_diagnostics_failed',
          transcriptionId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private async requireOne(id: string, userId: string): Promise<Transcription> {
    const item = await this.repository.findById(id);
    if (!item || !(await this.repository.hasAccess(userId, id)))
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
      processingPhase: item.processingPhase,
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

  private async ensureCapacity(userId: string): Promise<void> {
    const active = await this.repository.countActiveForUser(userId);
    const maxActive = this.numberConfig('TRANSCRIPTION_MAX_ACTIVE_PER_USER', 2);
    if (active >= maxActive) {
      throw new HttpException(
        {
          code: 'TRANSCRIPTION_USER_QUOTA_REACHED',
          message: 'Trop de transcriptions sont déjà en cours.',
        },
        429,
      );
    }

    if (typeof this.queue.getJobCounts !== 'function') return;
    const counts = await this.queueOperation(
      'capacityJobCounts',
      this.queue.getJobCounts('waiting', 'active', 'delayed'),
    );
    const queued =
      (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
    const maxQueueDepth = this.numberConfig(
      'TRANSCRIPTION_MAX_QUEUE_DEPTH',
      50,
    );
    if (queued >= maxQueueDepth) {
      throw new ServiceUnavailableException({
        code: 'TRANSCRIPTION_QUEUE_SATURATED',
        message: 'La file de transcription est temporairement saturée.',
      });
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof AggregateError && error.errors.length > 0)
      return error.errors.map((item) => this.errorMessage(item)).join('; ');
    if (error instanceof Error)
      return error.message || error.name || 'Unknown queue error';
    return String(error) || 'Unknown queue error';
  }

  private async queueOperation<T>(
    operation: string,
    promise: Promise<T>,
  ): Promise<T> {
    const timeoutMs = this.numberConfig(
      'TRANSCRIPTION_QUEUE_TIMEOUT_MS',
      10_000,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Redis ${operation} timed out`)),
            timeoutMs,
          );
        }),
      ]);
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'transcription.queue_operation_failed',
          operation,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw new ServiceUnavailableException({
        code: 'REDIS_UNAVAILABLE',
        message: 'Transcription queue is unavailable',
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
