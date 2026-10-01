import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { MusicProvider, TranscriptionStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import type {
  TranscriptionJobData,
  TranscriptionSegment,
} from './entities/transcription.types';
import { TranscriptionEvents } from './transcriptions.events';
import { TranscriptionMessageHandler } from './transcription-message-handler.service';
import { TranscriptionsRepository } from './transcriptions.repository';
import {
  TRANSCRIPTION_ERROR_CODE,
  TRANSCRIPTION_EVENT,
  TRANSCRIPTION_PHASE,
  TRANSCRIPTION_QUEUE,
  RETRYABLE_TRANSCRIPTION_ERROR_CODES,
} from './transcriptions.constants';
import { WhisperBridgeService } from './whisper-bridge.service';
import { TranscriptionAudioSourceService } from './transcription-audio-source.service';

@Injectable()
@Processor(TRANSCRIPTION_QUEUE, {
  concurrency: Number(process.env.TRANSCRIPTION_CONCURRENCY ?? 1),
})
export class TranscriptionsProcessor extends WorkerHost {
  private readonly logger = new Logger(TranscriptionsProcessor.name);

  constructor(
    private readonly repository: TranscriptionsRepository,
    private readonly events: TranscriptionEvents,
    private readonly audioSources: TranscriptionAudioSourceService,
    private readonly whisper: WhisperBridgeService,
    private readonly messages: TranscriptionMessageHandler,
  ) {
    super();
  }

  async process(job: Job<TranscriptionJobData>): Promise<void> {
    const { transcriptionId, trackId } = job.data;
    const provider = job.data.provider ?? MusicProvider.AUDIUS;
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
      processingPhase: TRANSCRIPTION_PHASE.AUDIO_PREPARING,
      attempts: { increment: 1 },
    });
    this.events.emit({
      type: TRANSCRIPTION_EVENT.PROCESSING,
      transcriptionId,
      progress: 0,
      bufferedUntil: 0,
    });
    try {
      const run = (audioUrl: string) =>
        this.whisper.run(
          {
            ...job.data,
            audioUrl,
            title: transcription?.title ?? undefined,
            artist: transcription?.artist ?? undefined,
          },
          (message) =>
            this.messages.handle(transcriptionId, message, segments, job),
        );
      if (provider === MusicProvider.YOUTUBE) {
        const extracted = await this.audioSources.extractYouTubeAudio(
          trackId,
          transcriptionId,
        );
        this.logger.log(
          JSON.stringify({
            event: 'transcription.audio_source_resolved',
            provider,
            transcriptionId,
            trackId,
            source: 'local_youtube_audio',
          }),
        );
        try {
          await this.whisper.run(
            {
              ...job.data,
              audioPath: extracted.audioPath,
              title: transcription?.title ?? undefined,
              artist: transcription?.artist ?? undefined,
            },
            (message) =>
              this.messages.handle(transcriptionId, message, segments, job),
          );
        } finally {
          await extracted.cleanup();
        }
      } else {
        const freshUrl = await this.audioSources.resolve(
          provider,
          trackId,
          job.data.audioUrl,
        );
        this.logger.log(
          JSON.stringify({
            event: 'transcription.audio_source_resolved',
            provider,
            transcriptionId,
            trackId,
            streamHost: new URL(freshUrl).hostname,
          }),
        );
        try {
          await run(freshUrl);
        } catch (error) {
          if (!this.isRetryableDownloadError(error)) throw error;
          this.logger.warn(
            JSON.stringify({
              event: 'transcription.audio_download_retry',
              transcriptionId,
              trackId,
              errorCode: this.errorCode(error),
              errorName: error instanceof Error ? error.name : 'UnknownError',
            }),
          );
          await run(
            await this.audioSources.resolve(
              provider,
              trackId,
              job.data.audioUrl,
            ),
          );
        }
      }
      this.logger.log(
        JSON.stringify({
          transcriptionId,
          jobId: job.id,
          trackId,
          status: TranscriptionStatus.COMPLETED,
          elapsedMs: Date.now() - startedAt,
          model: job.data.model,
        }),
      );
    } catch (error) {
      await this.handleFailure(job, error, startedAt);
    }
  }

  private async handleFailure(
    job: Job<TranscriptionJobData>,
    error: unknown,
    startedAt: number,
  ): Promise<never> {
    const { transcriptionId, trackId } = job.data;
    const finalAttempt = job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1);
    if (!finalAttempt) {
      this.logger.warn(
        JSON.stringify({
          event: 'transcription.job_retry_scheduled',
          transcriptionId,
          jobId: job.id,
          trackId,
          errorCode: this.errorCode(error),
          errorName: error instanceof Error ? error.name : 'UnknownError',
          nextAttempt: job.attemptsMade + 2,
        }),
      );
      await this.repository.update(transcriptionId, {
        status: TranscriptionStatus.PENDING,
        errorCode: null,
        errorMessage: null,
      });
    } else {
      await this.repository.markFailed(
        transcriptionId,
        this.errorCode(error),
        'Transcription failed',
      );
      this.events.emit({
        type: TRANSCRIPTION_EVENT.FAILED,
        transcriptionId,
        errorCode: this.errorCode(error),
        message: 'Transcription failed',
      });
      this.logger.error(
        JSON.stringify({
          transcriptionId,
          jobId: job.id,
          trackId,
          status: TranscriptionStatus.FAILED,
          errorCode: this.errorCode(error),
          errorName: error instanceof Error ? error.name : 'UnknownError',
          elapsedMs: Date.now() - startedAt,
        }),
      );
    }
    throw error;
  }

  private isRetryableDownloadError(error: unknown): boolean {
    return RETRYABLE_TRANSCRIPTION_ERROR_CODES.has(this.errorCode(error));
  }

  private errorCode(error: unknown): string {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
    )
      return (error as { code: string }).code;
    return TRANSCRIPTION_ERROR_CODE.FAILED;
  }
}
