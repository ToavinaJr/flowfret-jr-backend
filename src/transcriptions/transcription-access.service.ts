import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Transcription, TranscriptionStatus } from '@prisma/client';
import type { TranscriptionEvent } from './entities/transcription.types';
import {
  toTranscriptionResponse,
  TranscriptionResponse,
} from './transcription.presenter';
import { TranscriptionsRepository } from './transcriptions.repository';
import { buildTranscriptionJobId } from './transcriptions.utils';
import {
  TRANSCRIPTION_ERROR_CODE,
  TRANSCRIPTION_EVENT,
} from './transcriptions.constants';

@Injectable()
export class TranscriptionAccessService {
  constructor(private readonly repository: TranscriptionsRepository) {}

  async get(id: string, userId: string): Promise<TranscriptionResponse> {
    const item = await this.requireOne(id, userId);
    const jobId = buildTranscriptionJobId(
      item.trackId,
      item.requestedLanguage === 'auto' ? undefined : item.requestedLanguage,
      item.model,
      item.engineVersion,
    );
    const completed = item.status === TranscriptionStatus.COMPLETED;
    return toTranscriptionResponse(item, completed ? null : jobId, completed);
  }

  async snapshot(id: string, userId: string): Promise<TranscriptionEvent> {
    const item = await this.requireOne(id, userId);
    const type =
      item.status === TranscriptionStatus.COMPLETED
        ? TRANSCRIPTION_EVENT.COMPLETED
        : item.status === TranscriptionStatus.FAILED
          ? TRANSCRIPTION_EVENT.FAILED
          : item.readyToPlay
            ? TRANSCRIPTION_EVENT.READY_TO_PLAY
            : TRANSCRIPTION_EVENT.PROGRESS;
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

  async lrc(
    id: string,
    userId: string,
  ): Promise<{ content: string; filename: string }> {
    const item = await this.requireOne(id, userId);
    if (!item.lrcContent)
      throw new ConflictException({
        code: TRANSCRIPTION_ERROR_CODE.NOT_READY,
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

  async requireOne(id: string, userId: string): Promise<Transcription> {
    const item = await this.repository.findById(id);
    if (!item || !(await this.repository.hasAccess(userId, id)))
      throw new NotFoundException({
        code: TRANSCRIPTION_ERROR_CODE.NOT_FOUND,
        message: 'Transcription not found',
      });
    return item;
  }
}
