import { Injectable, Logger } from '@nestjs/common';
import { TranscriptionStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import type {
  TranscriptionJobData,
  TranscriptionSegment,
  WorkerMessage,
} from './entities/transcription.types';
import { TranscriptionEvents } from './transcriptions.events';
import { TranscriptionsRepository } from './transcriptions.repository';
import {
  TRANSCRIPTION_EVENT,
  TRANSCRIPTION_PHASE,
  WORKER_MESSAGE,
} from './transcriptions.constants';

@Injectable()
export class TranscriptionMessageHandler {
  private readonly logger = new Logger(TranscriptionMessageHandler.name);

  constructor(
    private readonly repository: TranscriptionsRepository,
    private readonly events: TranscriptionEvents,
  ) {}

  async handle(
    id: string,
    message: WorkerMessage,
    segments: TranscriptionSegment[],
    job: Job<TranscriptionJobData>,
  ): Promise<void> {
    switch (message.type) {
      case WORKER_MESSAGE.STARTED:
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
          processingPhase: TRANSCRIPTION_PHASE.TRANSCRIBING,
        });
        return;
      case WORKER_MESSAGE.MODEL_LOADING:
      case WORKER_MESSAGE.MODEL_READY: {
        const ready = message.type === WORKER_MESSAGE.MODEL_READY;
        const phase = ready
          ? TRANSCRIPTION_PHASE.MODEL_READY
          : TRANSCRIPTION_PHASE.MODEL_LOADING;
        await this.repository.update(id, { processingPhase: phase });
        this.events.emit({
          type: ready
            ? TRANSCRIPTION_EVENT.MODEL_READY
            : TRANSCRIPTION_EVENT.MODEL_LOADING,
          transcriptionId: id,
          progress: 0,
          processingPhase: phase,
        });
        return;
      }
      case WORKER_MESSAGE.SEGMENT:
        segments.push(message.segment);
        this.events.emit({
          type: TRANSCRIPTION_EVENT.SEGMENT,
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
      case WORKER_MESSAGE.PROGRESS:
        await job.updateProgress(message.progress);
        await this.repository.saveSegments(
          id,
          segments,
          message.bufferedUntil,
          message.progress,
        );
        this.events.emit({
          type: TRANSCRIPTION_EVENT.PROGRESS,
          transcriptionId: id,
          progress: message.progress,
          bufferedUntil: message.bufferedUntil,
        });
        return;
      case WORKER_MESSAGE.READY_TO_PLAY:
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
          type: TRANSCRIPTION_EVENT.READY_TO_PLAY,
          transcriptionId: id,
          readyToPlay: true,
          bufferedUntil: message.bufferedUntil,
        });
        return;
      case WORKER_MESSAGE.COMPLETED:
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
          processingPhase: TRANSCRIPTION_PHASE.COMPLETED,
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
          type: TRANSCRIPTION_EVENT.COMPLETED,
          transcriptionId: id,
          progress: 100,
          bufferedUntil: message.duration,
          readyToPlay: true,
        });
        return;
      case WORKER_MESSAGE.FAILED:
        throw Object.assign(new Error(message.message), {
          code: message.errorCode,
        });
    }
  }
}
