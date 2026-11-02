import { TRANSCRIPTION_JOB } from './transcriptions.constants';
import {
  createTranscriptionFixture,
  transcriptionRecord,
} from './transcription-test.factory';

describe('TranscriptionQueueService', () => {
  it('uses the shared job options when enqueueing a manual retry', async () => {
    const { queue, queueService } = createTranscriptionFixture();

    const jobId = await queueService.enqueueRetry(
      { ...transcriptionRecord, manualRetryCount: 1 },
      'https://audio.example.test/track.mp3',
    );

    expect(jobId).toMatch(/-retry-2$/);
    expect(queue.add).toHaveBeenCalledWith(
      TRANSCRIPTION_JOB,
      expect.objectContaining({
        transcriptionId: transcriptionRecord.id,
        trackId: transcriptionRecord.trackId,
        audioUrl: 'https://audio.example.test/track.mp3',
      }),
      expect.objectContaining({
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      }),
    );
  });

  it('normalizes queue errors from retries to the stable Redis error', async () => {
    const { queueService } = createTranscriptionFixture(null, {
      add: jest.fn().mockRejectedValue(new Error('Redis is down')),
    });

    await expect(
      queueService.enqueueRetry(
        transcriptionRecord,
        'https://audio.example.test/track.mp3',
      ),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: 'REDIS_UNAVAILABLE' },
    });
  });
});
