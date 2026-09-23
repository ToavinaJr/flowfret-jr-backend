import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { TranscriptionJobData } from './entities/transcription.types';
import {
  QUEUE_DIAGNOSTIC_STATUS,
  TRANSCRIPTION_ERROR_CODE,
  TRANSCRIPTION_QUEUE,
} from './transcriptions.constants';

@Injectable()
export class TranscriptionQueueDiagnosticsService {
  private readonly logger = new Logger(
    TranscriptionQueueDiagnosticsService.name,
  );

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(TRANSCRIPTION_QUEUE)
    private readonly queue: Queue<TranscriptionJobData>,
  ) {}

  async diagnostics(): Promise<Record<string, unknown>> {
    const configuration = {
      provider: this.config.get<string>('LLM_PROVIDER') ?? 'whisper',
      model: this.config.get<string>('WHISPER_MODEL') ?? 'small',
      concurrency: this.numberConfig('TRANSCRIPTION_CONCURRENCY', 1),
    };
    if (
      typeof this.queue.getJobCounts !== 'function' ||
      typeof this.queue.getWorkers !== 'function'
    )
      return {
        queue: TRANSCRIPTION_QUEUE,
        status: QUEUE_DIAGNOSTIC_STATUS.UNAVAILABLE,
        queueHealthy: false,
        available: false,
        workerCount: null,
        configuration,
        checkedAt: new Date().toISOString(),
      };
    const [counts, workers] = await Promise.all([
      this.operation(
        'diagnosticJobCounts',
        this.queue.getJobCounts(
          'waiting',
          'active',
          'delayed',
          'completed',
          'failed',
          'paused',
        ),
      ),
      this.operation('diagnosticWorkers', this.queue.getWorkers()),
    ]);
    return {
      queue: TRANSCRIPTION_QUEUE,
      status:
        workers.length > 0
          ? QUEUE_DIAGNOSTIC_STATUS.READY
          : QUEUE_DIAGNOSTIC_STATUS.NO_WORKER,
      queueHealthy: true,
      counts,
      workerCount: workers.length,
      configuration,
      workers: workers.map(({ id, name, addr }) => ({ id, name, addr })),
      checkedAt: new Date().toISOString(),
    };
  }

  async log(transcriptionId: string): Promise<void> {
    try {
      const diagnostics = await this.diagnostics();
      const payload = JSON.stringify({
        event: 'transcription.queue_diagnostics',
        transcriptionId,
        ...diagnostics,
      });
      if (diagnostics.workerCount === 0) this.logger.warn(payload);
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

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
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
}
