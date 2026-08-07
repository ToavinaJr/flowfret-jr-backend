import { ConfigService } from '@nestjs/config';
import { TranscriptionStatus } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { TranscriptionJobData } from './entities/transcription.types';
import { TranscriptionEvents } from './transcriptions.events';
import { TranscriptionsRepository } from './transcriptions.repository';
import { TranscriptionsService } from './transcriptions.service';

describe('TranscriptionsService', () => {
  const record = {
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
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
  };
  function setup(existing: typeof record | null = null) {
    const repository = {
      findCompatible: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockResolvedValue(record),
      findById: jest.fn().mockResolvedValue(existing ?? record),
      update: jest.fn(),
      saveSegments: jest.fn(),
      markFailed: jest.fn(),
    };
    const queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({ id: 'job' }),
    };
    const events = { emit: jest.fn() };
    const service = new TranscriptionsService(
      repository as unknown as TranscriptionsRepository,
      events as unknown as TranscriptionEvents,
      {
        get: jest.fn((key: string) =>
          key === 'WHISPER_ENGINE_VERSION' ? '1' : undefined,
        ),
      } as unknown as ConfigService,
      queue as unknown as Queue<TranscriptionJobData>,
    );
    return { service, repository, queue };
  }
  it('creates and enqueues immediately without invoking Whisper', async () => {
    const { service, queue } = setup();
    const result = await service.createOrGet({
      trackId: 'track',
      audioUrl: 'https://api.audius.co/audio',
      model: 'small',
    });
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
    const result = await service.createOrGet({
      trackId: 'track',
      audioUrl: 'https://api.audius.co/audio',
      model: 'small',
    });
    expect(result.cached).toBe(true);
    expect(result.jobId).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });
  it('reuses an existing deterministic BullMQ job', async () => {
    const { service, queue } = setup(record);
    queue.getJob.mockResolvedValue({ id: 'existing' });
    await service.createOrGet({
      trackId: 'track',
      audioUrl: 'https://api.audius.co/audio',
      model: 'small',
    });
    expect(queue.add).not.toHaveBeenCalled();
  });
});
