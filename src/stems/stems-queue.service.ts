import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { AudioStem } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { AudioStemJobData } from './entities/stem.types';
import {
  AUDIO_STEMS_JOB,
  AUDIO_STEMS_QUEUE,
  STEMS_ERROR_CODE,
} from './stems.constants';

const MAX_STEMS_QUEUE_ATTEMPTS = 3;

@Injectable()
export class StemsQueueService {
  private readonly logger = new Logger(StemsQueueService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(AUDIO_STEMS_QUEUE)
    private readonly queue: Queue<AudioStemJobData>,
  ) {
    if (typeof this.queue.on === 'function')
      this.queue.on('error', (error) =>
        this.logger.error(
          JSON.stringify({
            event: 'audio_stems.queue_error',
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      );
  }

  async enqueue(item: AudioStem, audioUrl: string): Promise<string> {
    const jobId = item.id;
    try {
      await this.operation(
        'add',
        this.queue.add(
          AUDIO_STEMS_JOB,
          {
            audioStemId: item.id,
            trackId: item.trackId,
            provider: item.provider,
            audioUrl,
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
          event: 'audio_stems.enqueued',
          audioStemId: item.id,
          trackId: item.trackId,
          jobId,
        }),
      );
      return jobId;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'audio_stems.enqueue_failed',
          audioStemId: item.id,
          trackId: item.trackId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw new ServiceUnavailableException({
        code: STEMS_ERROR_CODE.REDIS_UNAVAILABLE,
        message: 'The vocal separation queue is unavailable',
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

  private attemptsConfig(): number {
    const configured = Number(this.config.get('AUDIO_STEMS_ATTEMPTS') ?? 2);
    const valid =
      Number.isInteger(configured) && configured > 0 ? configured : 2;
    return Math.min(valid, MAX_STEMS_QUEUE_ATTEMPTS);
  }

  private async operation<T>(
    operation: string,
    promise: Promise<T>,
  ): Promise<T> {
    const timeoutMs = Number(
      this.config.get('AUDIO_STEMS_QUEUE_TIMEOUT_MS') ?? 10_000,
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
          event: 'audio_stems.queue_operation_failed',
          operation,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw new ServiceUnavailableException({
        code: STEMS_ERROR_CODE.REDIS_UNAVAILABLE,
        message: 'The vocal separation queue is unavailable',
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
