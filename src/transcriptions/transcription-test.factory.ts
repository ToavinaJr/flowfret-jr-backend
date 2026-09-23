/* istanbul ignore file -- shared Jest fixture, not production behavior */
import { ConfigService } from '@nestjs/config';
import { TranscriptionStatus, type Transcription } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { TranscriptionJobData } from './entities/transcription.types';
import { TranscriptionAccessService } from './transcription-access.service';
import { TranscriptionCapacityService } from './transcription-capacity.service';
import { TranscriptionEvents } from './transcriptions.events';
import { TranscriptionQueueDiagnosticsService } from './transcription-queue-diagnostics.service';
import { TranscriptionQueueService } from './transcription-queue.service';
import { TranscriptionWorkflowService } from './transcription-workflow.service';
import { TranscriptionsRepository } from './transcriptions.repository';
import { TranscriptionsService } from './transcriptions.service';

export const transcriptionRecord: Transcription = {
  id: '11111111-1111-4111-8111-111111111111',
  provider: 'AUDIUS',
  trackId: 'track',
  title: 'Title',
  artist: 'Artist',
  requestedLanguage: 'auto',
  detectedLanguage: null,
  model: 'small',
  engineVersion: '1',
  status: TranscriptionStatus.PENDING,
  progress: 0,
  bufferedUntil: 0,
  duration: null,
  readyToPlay: false,
  segments: [],
  lrcContent: null,
  errorCode: null,
  errorMessage: null,
  attempts: 0,
  manualRetryCount: 0,
  processingPhase: null,
  isDeleted: false,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  completedAt: null,
};

export function createTranscriptionFixture(
  existing: Transcription | null = null,
  queueOverrides: Record<string, unknown> = {},
) {
  const repository = {
    findCompatible: jest.fn().mockResolvedValue(existing),
    create: jest.fn().mockResolvedValue(transcriptionRecord),
    findById: jest.fn().mockResolvedValue(existing ?? transcriptionRecord),
    listForUser: jest.fn().mockResolvedValue([existing ?? transcriptionRecord]),
    update: jest.fn(),
    grantAccess: jest.fn().mockResolvedValue(undefined),
    hasAccess: jest.fn().mockResolvedValue(true),
    countActiveForUser: jest.fn().mockResolvedValue(0),
    saveSegments: jest.fn(),
    markFailed: jest.fn(),
  };
  const queue = {
    getJob: jest.fn().mockResolvedValue(null),
    add: jest.fn().mockResolvedValue({ id: 'job' }),
    ...queueOverrides,
  };
  const events = { emit: jest.fn() };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'WHISPER_ENGINE_VERSION') return '1';
      if (key === 'LLM_PROVIDER') return 'whisper';
      if (key === 'WHISPER_MODEL') return 'small';
      if (key === 'TRANSCRIPTION_CONCURRENCY') return '2';
      return undefined;
    }),
  } as unknown as ConfigService;
  const repositoryService = repository as unknown as TranscriptionsRepository;
  const bullQueue = queue as unknown as Queue<TranscriptionJobData>;
  const queueService = new TranscriptionQueueService(config, bullQueue);
  const access = new TranscriptionAccessService(repositoryService);
  const diagnostics = new TranscriptionQueueDiagnosticsService(
    config,
    bullQueue,
  );
  const capacity = new TranscriptionCapacityService(
    repositoryService,
    config,
    queueService,
  );
  const workflow = new TranscriptionWorkflowService(
    repositoryService,
    events as unknown as TranscriptionEvents,
    config,
    queueService,
    diagnostics,
    capacity,
    access,
  );
  const service = new TranscriptionsService(workflow, access, diagnostics);
  return {
    service,
    workflow,
    access,
    diagnostics,
    capacity,
    repository,
    queue,
    events,
  };
}
