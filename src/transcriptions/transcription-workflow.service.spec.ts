import { TranscriptionStatus } from '@prisma/client';
import {
  createTranscriptionFixture,
  transcriptionRecord,
} from './transcription-test.factory';

const request = {
  trackId: 'track',
  audioUrl: 'https://api.audius.co/audio',
  model: 'small',
};

describe('TranscriptionWorkflowService', () => {
  it('creates, grants access and enqueues new work', async () => {
    const { workflow, queue, repository, events } =
      createTranscriptionFixture();
    const result = await workflow.createOrGet(request, 'user-id');

    expect(result.status).toBe('PENDING');
    expect(repository.grantAccess).toHaveBeenCalledWith(
      'user-id',
      transcriptionRecord.id,
    );
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'transcription.pending' }),
    );
  });

  it('returns a completed cache entry without creating a job', async () => {
    const completed = {
      ...transcriptionRecord,
      status: TranscriptionStatus.COMPLETED,
      readyToPlay: true,
      lrcContent: '[00:00.00]Hi',
    };
    const { workflow, queue } = createTranscriptionFixture(completed);

    await expect(
      workflow.createOrGet(request, 'user-id'),
    ).resolves.toMatchObject({ cached: true, jobId: null });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('returns a failed cache entry for an explicit manual retry', async () => {
    const failed = {
      ...transcriptionRecord,
      status: TranscriptionStatus.FAILED,
      errorCode: 'AUDIO_DOWNLOAD_FAILED',
    };
    const { workflow, queue } = createTranscriptionFixture(failed);

    await expect(
      workflow.createOrGet(request, 'user-id'),
    ).resolves.toMatchObject({ cached: false, jobId: null, status: 'FAILED' });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('allows users to enqueue work while other transcriptions are active', async () => {
    const { workflow, queue } = createTranscriptionFixture();

    await expect(
      workflow.createOrGet({ ...request, trackId: 'other' }, 'user-id'),
    ).resolves.toMatchObject({ cached: false });
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('rejects work when the global queue is saturated', async () => {
    const { workflow, queue } = createTranscriptionFixture(null, {
      getJobCounts: jest
        .fn()
        .mockResolvedValue({ waiting: 49, active: 1, delayed: 0 }),
    });

    await expect(
      workflow.createOrGet({ ...request, trackId: 'other' }, 'user-id'),
    ).rejects.toMatchObject({ status: 503 });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('reuses an existing deterministic queue job', async () => {
    const { workflow, queue } = createTranscriptionFixture(transcriptionRecord);
    queue.getJob.mockResolvedValue({ id: 'existing' });

    await workflow.createOrGet(request, 'user-id');

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('resets and enqueues a failed transcription for manual retry', async () => {
    const failed = {
      ...transcriptionRecord,
      status: TranscriptionStatus.FAILED,
      attempts: 3,
      errorCode: 'AUDIO_DOWNLOAD_FAILED',
      errorMessage: 'temporary failure',
    };
    const { workflow, repository, queue } = createTranscriptionFixture(failed);
    repository.update.mockResolvedValue({
      ...failed,
      status: TranscriptionStatus.PENDING,
      manualRetryCount: 1,
    });

    await workflow.retry(transcriptionRecord.id, request.audioUrl, 'user-id');

    expect(repository.update).toHaveBeenCalledWith(
      transcriptionRecord.id,
      expect.objectContaining({ manualRetryCount: { increment: 1 } }),
    );
    const addCall = queue.add.mock.calls[0] as [
      unknown,
      unknown,
      { jobId: string },
    ];
    expect(addCall[2].jobId).toContain('-retry-1');
  });

  it('rejects retries for running work and exhausted manual retries', async () => {
    const running = createTranscriptionFixture(transcriptionRecord);
    await expect(
      running.workflow.retry(
        transcriptionRecord.id,
        request.audioUrl,
        'user-id',
      ),
    ).rejects.toMatchObject({
      response: { code: 'TRANSCRIPTION_ALREADY_RUNNING' },
    });

    const exhausted = createTranscriptionFixture({
      ...transcriptionRecord,
      status: TranscriptionStatus.FAILED,
      manualRetryCount: 3,
    });
    await expect(
      exhausted.workflow.retry(
        transcriptionRecord.id,
        request.audioUrl,
        'user-id',
      ),
    ).rejects.toMatchObject({ response: { code: 'TRANSCRIPTION_FAILED' } });
  });
});
