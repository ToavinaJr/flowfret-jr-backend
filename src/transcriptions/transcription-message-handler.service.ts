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
          processingPhase: 'TRANSCRIBING',
        });
        return;
      case 'model-loading':
      case 'model-ready': {
        const ready = message.type === 'model-ready';
        const phase = ready ? 'MODEL_READY' : 'MODEL_LOADING';
        await this.repository.update(id, { processingPhase: phase });
        this.events.emit({
          type: ready
            ? 'transcription.model-ready'
            : 'transcription.model-loading',
          transcriptionId: id,
          progress: 0,
          processingPhase: phase,
        });
        return;
      }
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
          processingPhase: 'COMPLETED',
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
}
