import { TranscriptionStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import type {
  TranscriptionJobData,
  WorkerMessage,
} from './entities/transcription.types';
import { TranscriptionsProcessor } from './transcriptions.processor';
import type { AudiusService } from '../integrations/audius/audius.service';
import type { TranscriptionEvents } from './transcriptions.events';
import type { TranscriptionsRepository } from './transcriptions.repository';
import type { WhisperBridgeService } from './whisper-bridge.service';

const transcriptionId = '11111111-1111-4111-8111-111111111111';
const jobData: TranscriptionJobData = {
  transcriptionId,
  trackId: 'track',
  audioUrl: 'https://api.audius.co/audio',
  model: 'small',
};

function setup() {
  const updates: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const repository = {
    findById: jest.fn().mockResolvedValue({ title: 'Title', artist: 'Artist' }),
    update: jest
      .fn()
      .mockImplementation((_id: string, data: Record<string, unknown>) => {
        updates.push(data);
        return data;
      }),
    saveSegments: jest.fn(),
    markFailed: jest.fn(),
  };
  const eventBus = {
    emit: jest.fn().mockImplementation((event: Record<string, unknown>) => {
      events.push(event);
    }),
  };
  const audius = {
    getFreshStreamUrl: jest
      .fn()
      .mockResolvedValue('https://audio.audius.co/fresh.mp3'),
  };
  const whisper = {
    run: jest
      .fn()
      .mockImplementation(
        async (
          _data: unknown,
          onMessage: (message: WorkerMessage) => Promise<void>,
        ) => {
          await onMessage({ type: 'model-loading' });
          await onMessage({ type: 'model-ready' });
          await onMessage({ type: 'started', duration: 12 });
          await onMessage({
            type: 'segment',
            segment: {
              id: 'segment-1',
              start: 0,
              end: 4,
              text: 'Hello',
              words: [],
            },
          });
          await onMessage({ type: 'progress', progress: 33, bufferedUntil: 4 });
          await onMessage({ type: 'ready-to-play', bufferedUntil: 4 });
          await onMessage({
            type: 'completed',
            duration: 12,
            detectedLanguage: 'en',
            lrc: '[00:00.00]Hello\n',
          });
        },
      ),
  };
  const processor = new TranscriptionsProcessor(
    repository as unknown as TranscriptionsRepository,
    eventBus as unknown as TranscriptionEvents,
    audius as unknown as AudiusService,
    whisper as unknown as WhisperBridgeService,
  );
  const job = {
    id: 'job-1',
    data: jobData,
    attemptsMade: 0,
    opts: { attempts: 1 },
    progress: 33,
    updateProgress: jest.fn(),
  } as unknown as Job<TranscriptionJobData>;
  return { processor, repository, updates, events, job };
}

describe('TranscriptionsProcessor deterministic flow', () => {
  it('persists and emits the complete model-to-playback lifecycle', async () => {
    const { processor, repository, updates, events, job } = setup();

    await processor.process(job);

    expect(repository.findById).toHaveBeenCalledWith(transcriptionId);
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: TranscriptionStatus.DOWNLOADING,
          processingPhase: 'AUDIO_PREPARING',
        }),
        expect.objectContaining({ processingPhase: 'MODEL_LOADING' }),
        expect.objectContaining({ processingPhase: 'MODEL_READY' }),
        expect.objectContaining({
          status: TranscriptionStatus.PROCESSING,
          processingPhase: 'TRANSCRIBING',
        }),
        expect.objectContaining({
          status: TranscriptionStatus.READY_TO_PLAY,
          readyToPlay: true,
        }),
        expect.objectContaining({
          status: TranscriptionStatus.COMPLETED,
          processingPhase: 'COMPLETED',
          progress: 100,
        }),
      ]),
    );
    expect(events.map((event) => event.type)).toEqual([
      'transcription.processing',
      'transcription.model-loading',
      'transcription.model-ready',
      'transcription.segment',
      'transcription.progress',
      'transcription.ready-to-play',
      'transcription.completed',
    ]);
  });

  it('returns a retryable job to pending without marking it failed', async () => {
    const { processor, repository, job } = setup();
    job.opts.attempts = 2;
    const whisper = Reflect.get(processor, 'whisper') as {
      run: jest.Mock;
    };
    whisper.run.mockRejectedValueOnce(
      Object.assign(new Error('temporary failure'), { code: 'TEMPORARY' }),
    );

    await expect(processor.process(job)).rejects.toThrow('temporary failure');
    expect(repository.update).toHaveBeenCalledWith(
      transcriptionId,
      expect.objectContaining({ status: TranscriptionStatus.PENDING }),
    );
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('marks a final worker failure and emits a safe failure event', async () => {
    const { processor, repository, events, job } = setup();
    const whisper = Reflect.get(processor, 'whisper') as {
      run: jest.Mock;
    };
    whisper.run.mockRejectedValueOnce(
      Object.assign(new Error('sensitive detail'), { code: 'WORKER_FAILED' }),
    );

    await expect(processor.process(job)).rejects.toThrow('sensitive detail');
    expect(repository.markFailed).toHaveBeenCalledWith(
      transcriptionId,
      'WORKER_FAILED',
      'sensitive detail',
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'transcription.failed',
        message: 'Transcription failed',
      }),
    );
  });
});
