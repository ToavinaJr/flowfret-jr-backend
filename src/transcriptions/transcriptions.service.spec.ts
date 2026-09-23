import { ConfigService } from '@nestjs/config';
import { TranscriptionStatus, type Transcription } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { TranscriptionJobData } from './entities/transcription.types';
import { TranscriptionEvents } from './transcriptions.events';
import { TranscriptionsRepository } from './transcriptions.repository';
import { TranscriptionsService } from './transcriptions.service';
import { TranscriptionAccessService } from './transcription-access.service';
import { TranscriptionQueueService } from './transcription-queue.service';
import { TranscriptionWorkflowService } from './transcription-workflow.service';
import { TranscriptionQueueDiagnosticsService } from './transcription-queue-diagnostics.service';
import { TranscriptionCapacityService } from './transcription-capacity.service';

describe('TranscriptionsService', () => {
  const record: Transcription = {
    id: '11111111-1111-4111-8111-111111111111',
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
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
  };
  function setup(
    existing: typeof record | null = null,
    queueOverrides: Record<string, unknown> = {},
  ) {
    const repository = {
      findCompatible: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockResolvedValue(record),
      findById: jest.fn().mockResolvedValue(existing ?? record),
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
    const queueService = new TranscriptionQueueService(
      config,
      queue as unknown as Queue<TranscriptionJobData>,
    );
    const access = new TranscriptionAccessService(repositoryService);
    const diagnostics = new TranscriptionQueueDiagnosticsService(
      config,
      queue as unknown as Queue<TranscriptionJobData>,
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
    return { service, repository, queue };
  }
  it('creates and enqueues immediately without invoking Whisper', async () => {
    const { service, queue } = setup();
    const result = await service.createOrGet(
      {
        trackId: 'track',
        audioUrl: 'https://api.audius.co/audio',
        model: 'small',
      },
      'user-id',
    );
    expect(result.status).toBe('PENDING');
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
  it('returns a completed cached transcription without a job', async () => {
    const completed = {
      ...record,
      status: TranscriptionStatus.COMPLETED,
      readyToPlay: true,
      lrcContent: '[00:00.00]Hi',
    };
    const { service, queue } = setup(completed);
    const result = await service.createOrGet(
      {
        trackId: 'track',
        audioUrl: 'https://api.audius.co/audio',
        model: 'small',
      },
      'user-id',
    );
    expect(result.cached).toBe(true);
    expect(result.jobId).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });
  it('rejects a new transcription when the user active-job quota is full', async () => {
    const { service, repository, queue } = setup();
    repository.countActiveForUser.mockResolvedValue(2);

    await expect(
      service.createOrGet(
        {
          trackId: 'another-track',
          audioUrl: 'https://api.audius.co/audio',
          model: 'small',
        },
        'user-id',
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejects new work when the global queue is saturated', async () => {
    const { service, queue } = setup(null, {
      getJobCounts: jest
        .fn()
        .mockResolvedValue({ waiting: 49, active: 1, delayed: 0 }),
    });

    await expect(
      service.createOrGet(
        {
          trackId: 'another-track',
          audioUrl: 'https://api.audius.co/audio',
          model: 'small',
        },
        'user-id',
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(queue.add).not.toHaveBeenCalled();
  });
  it('reuses an existing deterministic BullMQ job', async () => {
    const { service, queue } = setup(record);
    queue.getJob.mockResolvedValue({ id: 'existing' });
    await service.createOrGet(
      {
        trackId: 'track',
        audioUrl: 'https://api.audius.co/audio',
        model: 'small',
      },
      'user-id',
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not expose a transcription to a user without access', async () => {
    const { service, repository } = setup(record);
    repository.hasAccess.mockResolvedValue(false);

    await expect(service.get(record.id, 'another-user')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('allows a manual retry after automatic worker attempts are exhausted', async () => {
    const failed = {
      ...record,
      status: TranscriptionStatus.FAILED,
      attempts: 3,
      manualRetryCount: 0,
      errorCode: 'AUDIO_DOWNLOAD_FAILED',
      errorMessage: 'temporary failure',
    };
    const { service, repository, queue } = setup(failed);
    repository.update.mockResolvedValue({
      ...failed,
      status: TranscriptionStatus.PENDING,
      manualRetryCount: 1,
      errorCode: null,
      errorMessage: null,
    });

    await service.retry(record.id, 'https://api.audius.co/audio', 'user-id');

    expect(repository.update).toHaveBeenCalledWith(
      record.id,
      expect.objectContaining({ manualRetryCount: { increment: 1 } }),
    );
    expect(queue.add).toHaveBeenCalledTimes(1);
    const addCall = queue.add.mock.calls[0] as [
      unknown,
      unknown,
      { jobId: string },
    ];
    expect(addCall[2].jobId).toContain('-retry-1');
  });

  it('reports a ready queue with worker configuration', async () => {
    const { service } = setup(null, {
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0 }),
      getWorkers: jest
        .fn()
        .mockResolvedValue([
          { id: 'worker-1', name: 'transcribe', addr: 'worker-host' },
        ]),
    });

    await expect(service.diagnostics()).resolves.toMatchObject({
      status: 'READY',
      queueHealthy: true,
      workerCount: 1,
      configuration: { provider: 'whisper', model: 'small', concurrency: 2 },
    });
  });

  it('reports when Redis is available but no worker is connected', async () => {
    const { service } = setup(null, {
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 1, active: 0 }),
      getWorkers: jest.fn().mockResolvedValue([]),
    });

    await expect(service.diagnostics()).resolves.toMatchObject({
      status: 'NO_WORKER',
      queueHealthy: true,
      workerCount: 0,
    });
  });
});
