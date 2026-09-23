import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MusicProvider, Prisma, TranscriptionStatus } from '@prisma/client';
import { CreateTranscriptionDto } from './dto/create-transcription.dto';
import {
  DEFAULT_ENGINE_VERSION,
  MAX_RETRY_ATTEMPTS,
  TRANSCRIPTION_EVENT,
  TRANSCRIPTION_ERROR_CODE,
  TRANSCRIPTION_PHASE,
} from './transcriptions.constants';
import { TranscriptionEvents } from './transcriptions.events';
import {
  toTranscriptionResponse,
  TranscriptionResponse,
} from './transcription.presenter';
import { TranscriptionAccessService } from './transcription-access.service';
import { TranscriptionQueueService } from './transcription-queue.service';
import { TranscriptionQueueDiagnosticsService } from './transcription-queue-diagnostics.service';
import { TranscriptionCapacityService } from './transcription-capacity.service';
import { TranscriptionsRepository } from './transcriptions.repository';

@Injectable()
export class TranscriptionWorkflowService {
  private readonly logger = new Logger(TranscriptionWorkflowService.name);
  private readonly engineVersion: string;

  constructor(
    private readonly repository: TranscriptionsRepository,
    private readonly events: TranscriptionEvents,
    private readonly config: ConfigService,
    private readonly queue: TranscriptionQueueService,
    private readonly queueDiagnostics: TranscriptionQueueDiagnosticsService,
    private readonly capacity: TranscriptionCapacityService,
    private readonly access: TranscriptionAccessService,
  ) {
    this.engineVersion =
      this.config.get<string>('WHISPER_ENGINE_VERSION') ??
      DEFAULT_ENGINE_VERSION;
  }

  async createOrGet(
    dto: CreateTranscriptionDto,
    userId: string,
  ): Promise<TranscriptionResponse> {
    const language = dto.language ?? 'auto';
    const provider = dto.provider ?? MusicProvider.AUDIUS;
    this.logger.log(
      JSON.stringify({
        event: 'transcription.requested',
        trackId: dto.trackId,
        language,
        model: dto.model,
      }),
    );
    let item = await this.repository.findCompatible(
      provider,
      dto.trackId,
      language,
      dto.model,
      this.engineVersion,
    );
    let created = false;
    if (!item) {
      await this.capacity.ensure(userId);
      try {
        item = await this.repository.create({
          provider,
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
        item = await this.repository.findCompatible(
          provider,
          dto.trackId,
          language,
          dto.model,
          this.engineVersion,
        );
        if (!item) throw error;
      }
    }
    await this.repository.grantAccess(userId, item.id);
    if (item.status === TranscriptionStatus.FAILED) {
      this.logger.warn(
        JSON.stringify({
          event: 'transcription.reused_failed',
          transcriptionId: item.id,
          trackId: dto.trackId,
          errorCode: item.errorCode,
        }),
      );
      return toTranscriptionResponse(item, null, false);
    }
    if (item.status === TranscriptionStatus.COMPLETED) {
      this.logger.log(
        JSON.stringify({
          event: 'transcription.cache_hit',
          transcriptionId: item.id,
          trackId: dto.trackId,
        }),
      );
      return toTranscriptionResponse(item, null, true);
    }
    const jobId = await this.queue.enqueue(item, dto, this.engineVersion);
    await this.queueDiagnostics.log(item.id);
    if (created)
      this.events.emit({
        type: TRANSCRIPTION_EVENT.PENDING,
        transcriptionId: item.id,
        progress: 0,
        bufferedUntil: 0,
      });
    return toTranscriptionResponse(item, jobId, false);
  }

  async retry(
    id: string,
    audioUrl: string,
    userId: string,
  ): Promise<TranscriptionResponse> {
    const item = await this.access.requireOne(id, userId);
    if (item.status !== TranscriptionStatus.FAILED)
      throw new ConflictException({
        code: TRANSCRIPTION_ERROR_CODE.ALREADY_RUNNING,
        message: 'Only failed transcriptions can be retried',
      });
    if (item.manualRetryCount >= MAX_RETRY_ATTEMPTS)
      throw new ConflictException({
        code: TRANSCRIPTION_ERROR_CODE.FAILED,
        message: 'Retry limit reached',
      });
    const reset = await this.repository.update(id, {
      status: TranscriptionStatus.PENDING,
      progress: 0,
      bufferedUntil: 0,
      readyToPlay: false,
      manualRetryCount: { increment: 1 },
      processingPhase: TRANSCRIPTION_PHASE.AUDIO_PREPARING,
      errorCode: null,
      errorMessage: null,
    });
    const jobId = await this.queue.enqueueRetry(item, audioUrl);
    this.logger.log(
      JSON.stringify({
        event: 'transcription.retry_enqueued',
        transcriptionId: id,
        trackId: item.trackId,
        jobId,
      }),
    );
    await this.queueDiagnostics.log(id);
    return toTranscriptionResponse(reset, jobId, false);
  }
}
