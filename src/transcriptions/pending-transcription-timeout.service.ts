import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  TRANSCRIPTION_ERROR_CODE,
  TRANSCRIPTION_EVENT,
} from './transcriptions.constants';
import { TranscriptionEvents } from './transcriptions.events';
import { TranscriptionsRepository } from './transcriptions.repository';
import { TranscriptionQueueService } from './transcription-queue.service';

const PENDING_TIMEOUT_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 1000;
const PENDING_TIMEOUT_MESSAGE =
  'No worker started the transcription within 5 minutes.';

@Injectable()
export class PendingTranscriptionTimeoutService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PendingTranscriptionTimeoutService.name);
  private interval: ReturnType<typeof setInterval> | undefined;
  private sweepInProgress = false;

  constructor(
    private readonly repository: TranscriptionsRepository,
    private readonly queue: TranscriptionQueueService,
    private readonly events: TranscriptionEvents,
  ) {}

  onModuleInit(): void {
    void this.expireStalePending();
    this.interval = setInterval(
      () => void this.expireStalePending(),
      CLEANUP_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async expireStalePending(): Promise<void> {
    if (this.sweepInProgress) return;
    this.sweepInProgress = true;
    const before = new Date(Date.now() - PENDING_TIMEOUT_MS);

    try {
      const stale = await this.repository.findStalePendingBefore(before);
      const failedIds: string[] = [];
      for (const item of stale) {
        const failed = await this.repository.failPendingIfStale(
          item.id,
          before,
        );
        if (!failed) continue;
        failedIds.push(item.id);
        this.logger.warn(
          JSON.stringify({
            event: 'transcription.status_changed',
            transcriptionId: item.id,
            previousStatus: 'PENDING',
            status: 'FAILED',
            errorCode: TRANSCRIPTION_ERROR_CODE.PENDING_TIMEOUT,
            source: 'pending_timeout',
          }),
        );
        this.events.emit({
          type: TRANSCRIPTION_EVENT.FAILED,
          transcriptionId: item.id,
          errorCode: TRANSCRIPTION_ERROR_CODE.PENDING_TIMEOUT,
          message: PENDING_TIMEOUT_MESSAGE,
        });
      }

      if (failedIds.length > 0) {
        const removedJobs =
          await this.queue.removeJobsForTranscriptions(failedIds);
        this.logger.warn(
          JSON.stringify({
            event: 'transcription.pending_timeout_applied',
            failedCount: failedIds.length,
            removedJobs,
          }),
        );
      }
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'transcription.pending_timeout_sweep_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      this.sweepInProgress = false;
    }
  }
}
