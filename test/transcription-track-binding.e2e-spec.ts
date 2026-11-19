import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { MusicProvider } from '@prisma/client';
import type { Server } from 'node:http';
import request from 'supertest';
import { TranscriptionAudioSourceService } from '../src/transcriptions/transcription-audio-source.service';
import { TranscriptionAccessService } from '../src/transcriptions/transcription-access.service';
import { TranscriptionCapacityService } from '../src/transcriptions/transcription-capacity.service';
import { TranscriptionQueueDiagnosticsService } from '../src/transcriptions/transcription-queue-diagnostics.service';
import { TranscriptionQueueService } from '../src/transcriptions/transcription-queue.service';
import { TranscriptionWorkflowService } from '../src/transcriptions/transcription-workflow.service';
import { TranscriptionEvents } from '../src/transcriptions/transcriptions.events';
import { TranscriptionsController } from '../src/transcriptions/transcriptions.controller';
import { TranscriptionsRepository } from '../src/transcriptions/transcriptions.repository';
import { TranscriptionsService } from '../src/transcriptions/transcriptions.service';
import { transcriptionRecord } from '../src/transcriptions/transcription-test.factory';

describe('Spotify transcription track binding (e2e)', () => {
  let app: INestApplication;
  const canonicalPreviewUrl =
    'https://p.scdn.co/mp3-preview/track-b-preview.mp3';
  const audioSources = { resolve: jest.fn() };
  const queue = { enqueue: jest.fn(), enqueueRetry: jest.fn() };
  const repository = {
    findCompatible: jest.fn(),
    create: jest.fn(),
    grantAccess: jest.fn(),
  };

  beforeAll(async () => {
    audioSources.resolve.mockResolvedValue(canonicalPreviewUrl);
    queue.enqueue.mockResolvedValue('job-id');
    repository.findCompatible.mockResolvedValue(null);
    repository.create.mockResolvedValue({
      ...transcriptionRecord,
      provider: MusicProvider.SPOTIFY,
      trackId: 'track-b',
    });
    repository.grantAccess.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      controllers: [TranscriptionsController],
      providers: [
        TranscriptionsService,
        TranscriptionWorkflowService,
        { provide: TranscriptionsRepository, useValue: repository },
        { provide: TranscriptionEvents, useValue: { emit: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'WHISPER_ENGINE_VERSION' ? '1' : undefined,
          },
        },
        { provide: TranscriptionQueueService, useValue: queue },
        {
          provide: TranscriptionQueueDiagnosticsService,
          useValue: { log: jest.fn() },
        },
        {
          provide: TranscriptionCapacityService,
          useValue: { ensure: jest.fn() },
        },
        {
          provide: TranscriptionAccessService,
          useValue: { requireOne: jest.fn() },
        },
        {
          provide: TranscriptionAudioSourceService,
          useValue: audioSources,
        },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user?: unknown } };
        }) => {
          context.switchToHttp().getRequest().user = { sub: 'e2e-user' };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication(new ExpressAdapter());
    app.useLogger(false);
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    audioSources.resolve.mockResolvedValue(canonicalPreviewUrl);
    queue.enqueue.mockResolvedValue('job-id');
    repository.findCompatible.mockResolvedValue(null);
    repository.create.mockResolvedValue({
      ...transcriptionRecord,
      provider: MusicProvider.SPOTIFY,
      trackId: 'track-b',
    });
    repository.grantAccess.mockResolvedValue(undefined);
  });

  it('queues the preview resolved for track B when the client submits track A audio', async () => {
    await request(app.getHttpServer() as Server)
      .post('/api/transcriptions')
      .send({
        provider: 'SPOTIFY',
        trackId: 'track-b',
        audioUrl: 'https://p.scdn.co/mp3-preview/track-a-preview.mp3',
        title: 'Track B',
        artist: 'Artist',
        model: 'small',
      })
      .expect(201);

    expect(audioSources.resolve).toHaveBeenCalledWith(
      MusicProvider.SPOTIFY,
      'track-b',
      'https://p.scdn.co/mp3-preview/track-a-preview.mp3',
    );
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ trackId: 'track-b' }),
      expect.objectContaining({ audioUrl: canonicalPreviewUrl }),
      '1',
    );
  });

  afterAll(async () => {
    await app.close();
  });
});
