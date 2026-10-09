import { MusicProvider, TranscriptionStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import type {
  TranscriptionJobData,
  WorkerMessage,
} from './entities/transcription.types';
import { TranscriptionsProcessor } from './transcriptions.processor';
import type { TranscriptionAudioSourceService } from './transcription-audio-source.service';
import type { TranscriptionEvents } from './transcriptions.events';
import type { TranscriptionsRepository } from './transcriptions.repository';
import type { WhisperBridgeService } from './whisper-bridge.service';
import { TranscriptionMessageHandler } from './transcription-message-handler.service';
import type { LyricsAlignmentService } from '../integrations/lyrics/lyrics-alignment.service';

const transcriptionId = '11111111-1111-4111-8111-111111111111';
const jobData: TranscriptionJobData = {
  transcriptionId,
  trackId: 'track',
  provider: MusicProvider.AUDIUS,
  audioUrl: 'https://api.audius.co/audio',
  model: 'small',
};

function setup() {
  const updates: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const repository = {
    findById: jest.fn().mockResolvedValue({ title: 'Title', artist: 'Artist' }),
    claimPending: jest.fn().mockResolvedValue(true),
    update: jest
      .fn()
      .mockImplementation((_id: string, data: Record<string, unknown>) => {
        updates.push(data);
        return data;
      }),
    saveSegments: jest.fn(),
    markFailed: jest
      .fn()
      .mockResolvedValue({ status: TranscriptionStatus.FAILED }),
  };
  const eventBus = {
    emit: jest.fn().mockImplementation((event: Record<string, unknown>) => {
      events.push(event);
    }),
  };
  const audioSources = {
    resolve: jest.fn().mockResolvedValue('https://audio.audius.co/fresh.mp3'),
    extractYouTubeAudio: jest.fn().mockResolvedValue({
      audioPath: '/tmp/source.audio',
      cleanup: jest.fn().mockResolvedValue(undefined),
    }),
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
  const lyricsAlignment = {
    upgradeAfterTranscription: jest.fn().mockResolvedValue(undefined),
  };
  const processor = new TranscriptionsProcessor(
    repository as unknown as TranscriptionsRepository,
    eventBus as unknown as TranscriptionEvents,
    audioSources as unknown as TranscriptionAudioSourceService,
    whisper as unknown as WhisperBridgeService,
    new TranscriptionMessageHandler(
      repository as unknown as TranscriptionsRepository,
      eventBus as unknown as TranscriptionEvents,
      lyricsAlignment as unknown as LyricsAlignmentService,
    ),
  );
  const job = {
    id: 'job-1',
    data: jobData,
    attemptsMade: 0,
    opts: { attempts: 1 },
    progress: 33,
    updateProgress: jest.fn(),
  } as unknown as Job<TranscriptionJobData>;
  return { processor, repository, audioSources, whisper, updates, events, job };
}

describe('TranscriptionsProcessor deterministic flow', () => {
  it('persists and emits the complete model-to-playback lifecycle', async () => {
    const { processor, repository, updates, events, job } = setup();

    await processor.process(job);

    expect(repository.findById).toHaveBeenCalledWith(transcriptionId);
    expect(repository.claimPending).toHaveBeenCalledWith(transcriptionId);
    expect(updates).toEqual(
      expect.arrayContaining([
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

  it('uses the YouTube audio source when the job provider is YOUTUBE', async () => {
    const { processor, audioSources, whisper, job } = setup();
    job.data = {
      ...jobData,
      provider: MusicProvider.YOUTUBE,
      trackId: 'video-id',
      audioUrl: 'https://www.youtube.com/watch?v=video-id',
    };

    await processor.process(job);

    expect(audioSources.extractYouTubeAudio).toHaveBeenCalledWith(
      'video-id',
      transcriptionId,
    );
    expect(audioSources.resolve).not.toHaveBeenCalled();
    expect(whisper.run).toHaveBeenCalledWith(
      expect.objectContaining({ audioPath: '/tmp/source.audio' }),
      expect.any(Function),
    );
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
      'Transcription failed',
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'transcription.failed',
        message: 'Transcription failed',
      }),
    );
  });
});
