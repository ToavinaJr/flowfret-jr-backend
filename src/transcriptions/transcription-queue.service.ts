import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { MusicProvider, Transcription } from '@prisma/client';
import type { Queue } from 'bullmq';
import { CreateTranscriptionDto } from './dto/create-transcription.dto';
import type { TranscriptionJobData } from './entities/transcription.types';
import {
  TRANSCRIPTION_ERROR_CODE,
  TRANSCRIPTION_JOB,
  TRANSCRIPTION_QUEUE,
} from './transcriptions.constants';
import { buildTranscriptionJobId } from './transcriptions.utils';

const MAX_TRANSCRIPTION_QUEUE_ATTEMPTS = 5;

@Injectable()
export class TranscriptionQueueService {
  private readonly logger = new Logger(TranscriptionQueueService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(TRANSCRIPTION_QUEUE)
    private readonly queue: Queue<TranscriptionJobData>,
  ) {
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

  async enqueue(
    item: Transcription,
    dto: CreateTranscriptionDto,
    engineVersion: string,
  ): Promise<string> {
    const jobId = buildTranscriptionJobId(
      dto.trackId,
      dto.language,
      dto.model,
      engineVersion,
      dto.provider ?? MusicProvider.AUDIUS,
    );
    const existing = await this.operation('getJob', this.queue.getJob(jobId));
    if (existing) {
      const jobState =
        typeof existing.getState === 'function'
          ? await existing.getState()
          : 'unknown';
      this.logger.log(
        JSON.stringify({
          event: 'transcription.job_reused',
          transcriptionId: item.id,
          trackId: dto.trackId,
          jobId,
          jobState,
          transcriptionStatus: item.status,
        }),
      );
      return jobId;
    }
    try {
      await this.operation(
        'add',
        this.queue.add(
          TRANSCRIPTION_JOB,
          {
            transcriptionId: item.id,
            trackId: dto.trackId,
            provider: dto.provider ?? MusicProvider.AUDIUS,
            audioUrl: dto.audioUrl,
            language: dto.language,
            model: dto.model,
          },
          {
            jobId,
            attempts: this.attemptsConfig(),
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: { age: 3600, count: 100 },
            removeOnFail: { age: 86_400, count: 500 },
          },
        ),
      );
      this.logger.log(
        JSON.stringify({
          event: 'transcription.enqueued',
          transcriptionId: item.id,
          trackId: dto.trackId,
          jobId,
          queueState: 'waiting',
          transcriptionStatus: item.status,
        }),
      );
      return jobId;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'transcription.enqueue_failed',
          transcriptionId: item.id,
          trackId: dto.trackId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw new ServiceUnavailableException({
        code: TRANSCRIPTION_ERROR_CODE.REDIS_UNAVAILABLE,
        message: 'Transcription queue is unavailable',
      });
    }
  }

  async jobCounts(
    ...types: Parameters<Queue['getJobCounts']>
  ): Promise<Record<string, number>> {
    if (typeof this.queue.getJobCounts !== 'function') return {};
    return this.operation(
      'capacityJobCounts',
      this.queue.getJobCounts(...types),
    );
  }

  async enqueueRetry(item: Transcription, audioUrl: string): Promise<string> {
    const language =
      item.requestedLanguage === 'auto' ? undefined : item.requestedLanguage;
    const baseId = buildTranscriptionJobId(
      item.trackId,
      language,
      item.model,
      item.engineVersion,
      item.provider,
    );
    const jobId = `${baseId}-retry-${item.manualRetryCount + 1}`;
    await this.queue.add(
      TRANSCRIPTION_JOB,
      {
        transcriptionId: item.id,
        trackId: item.trackId,
        provider: item.provider,
        audioUrl,
        language,
        model: item.model,
      },
      {
        jobId,
        attempts: this.attemptsConfig(),
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86_400, count: 500 },
      },
    );
    return jobId;
  }

  async removeJobsForTranscriptions(
    transcriptionIds: readonly string[],
  ): Promise<number> {
    if (transcriptionIds.length === 0) return 0;
    const targetIds = new Set(transcriptionIds);
    const jobs = await this.operation(
      'findPendingJobsToExpire',
      this.queue.getJobs(['waiting', 'delayed', 'paused'], 0, -1),
    );
    let removed = 0;
    for (const job of jobs) {
      if (!targetIds.has(job.data.transcriptionId)) continue;
      try {
        await job.remove();
        removed += 1;
      } catch (error) {
        if ((await job.getState()) !== 'active') throw error;
      }
    }
    return removed;
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private attemptsConfig(): number {
    const configured = Number(this.config.get('TRANSCRIPTION_ATTEMPTS') ?? 3);
    const valid =
      Number.isInteger(configured) && configured > 0 ? configured : 3;
    const attempts = Math.min(valid, MAX_TRANSCRIPTION_QUEUE_ATTEMPTS);
    if (attempts < valid)
      this.logger.warn(
        JSON.stringify({
          event: 'transcription.attempts_capped',
          configuredAttempts: valid,
          maximumAttempts: MAX_TRANSCRIPTION_QUEUE_ATTEMPTS,
        }),
      );
    return attempts;
  }

  private async operation<T>(
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
        code: TRANSCRIPTION_ERROR_CODE.REDIS_UNAVAILABLE,
        message: 'Transcription queue is unavailable',
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof AggregateError && error.errors.length > 0)
      return error.errors.map((item) => this.errorMessage(item)).join('; ');
    return error instanceof Error
      ? error.message || error.name || 'Unknown queue error'
      : String(error) || 'Unknown queue error';
  }
}
