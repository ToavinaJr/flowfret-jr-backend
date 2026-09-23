import { Injectable } from '@nestjs/common';
import { CreateTranscriptionDto } from './dto/create-transcription.dto';
import type { TranscriptionEvent } from './entities/transcription.types';
import { TranscriptionAccessService } from './transcription-access.service';
import type { TranscriptionResponse } from './transcription.presenter';
import { TranscriptionQueueDiagnosticsService } from './transcription-queue-diagnostics.service';
import { TranscriptionWorkflowService } from './transcription-workflow.service';

export type { TranscriptionResponse } from './transcription.presenter';

@Injectable()
export class TranscriptionsService {
  constructor(
    private readonly workflow: TranscriptionWorkflowService,
    private readonly access: TranscriptionAccessService,
    private readonly queueDiagnostics: TranscriptionQueueDiagnosticsService,
  ) {}

  createOrGet(
    dto: CreateTranscriptionDto,
    userId: string,
  ): Promise<TranscriptionResponse> {
    return this.workflow.createOrGet(dto, userId);
  }

  get(id: string, userId: string): Promise<TranscriptionResponse> {
    return this.access.get(id, userId);
  }

  list(userId: string, take = 20): Promise<TranscriptionResponse[]> {
    return this.access.list(userId, take);
  }

  getEventSnapshot(id: string, userId: string): Promise<TranscriptionEvent> {
    return this.access.snapshot(id, userId);
  }

  getLrc(
    id: string,
    userId: string,
  ): Promise<{ content: string; filename: string }> {
    return this.access.lrc(id, userId);
  }

  retry(
    id: string,
    audioUrl: string,
    userId: string,
  ): Promise<TranscriptionResponse> {
    return this.workflow.retry(id, audioUrl, userId);
  }

  diagnostics(): Promise<Record<string, unknown>> {
    return this.queueDiagnostics.diagnostics();
  }
}
