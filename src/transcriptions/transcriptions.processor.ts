import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { TranscriptionStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import { AudiusService } from '../integrations/audius/audius.service';
import { TRANSCRIPTION_QUEUE } from './transcriptions.constants';
import type {
  TranscriptionJobData,
  TranscriptionSegment,
  WorkerMessage,
} from './entities/transcription.types';
import { TranscriptionEvents } from './transcriptions.events';
import { TranscriptionsRepository } from './transcriptions.repository';
import { WhisperBridgeService } from './whisper-bridge.service';

@Injectable()
@Processor(TRANSCRIPTION_QUEUE, {
  concurrency: Number(process.env.TRANSCRIPTION_CONCURRENCY ?? 1),
})
export class TranscriptionsProcessor extends WorkerHost {
  private readonly logger = new Logger(TranscriptionsProcessor.name);
  constructor(
    private readonly repository: TranscriptionsRepository,
    private readonly events: TranscriptionEvents,
    private readonly audius: AudiusService,
    private readonly whisper: WhisperBridgeService,
  ) {
    super();
  }

  async process(job: Job<TranscriptionJobData>): Promise<void> {
    const { transcriptionId, trackId } = job.data;
    const startedAt = Date.now();
    const segments: TranscriptionSegment[] = [];
    this.logger.log(
      JSON.stringify({
        event: 'transcription.job_started',
        transcriptionId,
        trackId,
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        configuredAttempts: job.opts.attempts,
      }),
    );
    const transcription = await this.repository.findById(transcriptionId);
    await this.repository.update(transcriptionId, {
      status: TranscriptionStatus.DOWNLOADING,
      attempts: { increment: 1 },
    });
    this.events.emit({
      type: 'transcription.processing',
      transcriptionId,
      progress: 0,
      bufferedUntil: 0,
    });
    try {
      const freshUrl = await this.audius.getFreshStreamUrl(
        trackId,
        job.data.audioUrl,
      );
      this.logger.log(
        JSON.stringify({
          event: 'transcription.audius_stream_resolved',
          transcriptionId,
          trackId,
          streamHost: new URL(freshUrl).hostname,
        }),
      );
      const run = (audioUrl: string) =>
        this.whisper.run(
          {
            ...job.data,
            audioUrl,
            title: transcription?.title ?? undefined,
            artist: transcription?.artist ?? undefined,
          },
          async (message) =>
            this.handleMessage(transcriptionId, message, segments, job),
        );
      try {
        await run(freshUrl);
      } catch (error) {
        const retryableDownloadErrors = [
          'AUDIO_URL_EXPIRED',
          'AUDIO_DOWNLOAD_FAILED',
        ];
        if (!retryableDownloadErrors.includes(this.errorCode(error)))
          throw error;
        this.logger.warn(
          JSON.stringify({
            event: 'transcription.audio_download_retry',
            transcriptionId,
            trackId,
            errorCode: this.errorCode(error),
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        await run(await this.audius.getFreshStreamUrl(trackId));
      }
      this.logger.log(
        JSON.stringify({
          transcriptionId,
          jobId: job.id,
          trackId,
          status: 'COMPLETED',
          elapsedMs: Date.now() - startedAt,
          model: job.data.model,
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Transcription failed';
      const finalAttempt =
        job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1);
      if (!finalAttempt) {
        this.logger.warn(
          JSON.stringify({
            event: 'transcription.job_retry_scheduled',
            transcriptionId,
            jobId: job.id,
            trackId,
            errorCode: this.errorCode(error),
            error: message,
            nextAttempt: job.attemptsMade + 2,
          }),
        );
        await this.repository.update(transcriptionId, {
          status: TranscriptionStatus.PENDING,
          errorCode: null,
          errorMessage: null,
        });
        throw error;
      }
      await this.repository.markFailed(
        transcriptionId,
        this.errorCode(error),
        message,
      );
      this.events.emit({
        type: 'transcription.failed',
        transcriptionId,
        errorCode: this.errorCode(error),
        message: 'Transcription failed',
      });
      this.logger.error(
        JSON.stringify({
          transcriptionId,
          jobId: job.id,
          trackId,
          status: 'FAILED',
          errorCode: this.errorCode(error),
          error: message,
          elapsedMs: Date.now() - startedAt,
        }),
      );
      throw error;
    }
  }

  private async handleMessage(
    id: string,
    message: WorkerMessage,
    segments: TranscriptionSegment[],
    job: Job<TranscriptionJobData>,
  ): Promise<void> {
    switch (message.type) {
      case 'started':
        this.logger.log(
          JSON.stringify({
            event: 'transcription.whisper_started',
            transcriptionId: id,
            jobId: job.id,
            duration: message.duration,
          }),
        );
        await this.repository.update(id, {
          status: TranscriptionStatus.PROCESSING,
          duration: message.duration,
        });
        return;
      case 'segment':
        segments.push(message.segment);
        this.events.emit({
          type: 'transcription.segment',
          transcriptionId: id,
          segment: message.segment,
          bufferedUntil: message.segment.end,
        });
        if (segments.length % 5 === 0)
          await this.repository.saveSegments(
            id,
            segments,
            message.segment.end,
            Math.round(job.progress as number) || 0,
          );
        return;
      case 'progress':
        await job.updateProgress(message.progress);
        await this.repository.saveSegments(
          id,
          segments,
          message.bufferedUntil,
          message.progress,
        );
        this.events.emit({
          type: 'transcription.progress',
          transcriptionId: id,
          progress: message.progress,
          bufferedUntil: message.bufferedUntil,
        });
        return;
      case 'ready-to-play':
        this.logger.log(
          JSON.stringify({
            event: 'transcription.ready_to_play',
            transcriptionId: id,
            jobId: job.id,
            bufferedUntil: message.bufferedUntil,
            segmentCount: segments.length,
          }),
        );
        await this.repository.update(id, {
          status: TranscriptionStatus.READY_TO_PLAY,
          readyToPlay: true,
          bufferedUntil: message.bufferedUntil,
          segments: segments as never,
        });
        this.events.emit({
          type: 'transcription.ready-to-play',
          transcriptionId: id,
          readyToPlay: true,
          bufferedUntil: message.bufferedUntil,
        });
        return;
      case 'completed':
        this.logger.log(
          JSON.stringify({
            event: 'transcription.whisper_completed',
            transcriptionId: id,
            jobId: job.id,
            duration: message.duration,
            detectedLanguage: message.detectedLanguage,
            segmentCount: segments.length,
          }),
        );
        await this.repository.update(id, {
          status: TranscriptionStatus.COMPLETED,
          progress: 100,
          readyToPlay: true,
          bufferedUntil: message.duration,
          duration: message.duration,
          detectedLanguage: message.detectedLanguage,
          segments: segments as never,
          lrcContent: message.lrc,
          completedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        });
        this.events.emit({
          type: 'transcription.completed',
          transcriptionId: id,
          progress: 100,
          bufferedUntil: message.duration,
          readyToPlay: true,
        });
        return;
      case 'failed':
        throw Object.assign(new Error(message.message), {
          code: message.errorCode,
        });
    }
  }

  private errorCode(error: unknown): string {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
    )
      return (error as { code: string }).code;
    return 'TRANSCRIPTION_FAILED';
  }
}
