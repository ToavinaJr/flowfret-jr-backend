import { createTranscriptionFixture } from './transcription-test.factory';

describe('TranscriptionQueueDiagnosticsService', () => {
  it('reports queue and worker readiness', async () => {
    const { diagnostics } = createTranscriptionFixture(null, {
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0 }),
      getWorkers: jest
        .fn()
        .mockResolvedValue([
          { id: 'worker-1', name: 'transcribe', addr: 'worker-host' },
        ]),
    });

    await expect(diagnostics.diagnostics()).resolves.toMatchObject({
      status: 'READY',
      queueHealthy: true,
      workerCount: 1,
      configuration: { provider: 'whisper', model: 'small', concurrency: 2 },
    });
  });

  it('reports when Redis is available but no worker is connected', async () => {
    const { diagnostics } = createTranscriptionFixture(null, {
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 1, active: 0 }),
      getWorkers: jest.fn().mockResolvedValue([]),
    });

    await expect(diagnostics.diagnostics()).resolves.toMatchObject({
      status: 'NO_WORKER',
      queueHealthy: true,
      workerCount: 0,
    });
  });

  it('reports unavailable queue methods without calling Redis', async () => {
    const { diagnostics } = createTranscriptionFixture();

    await expect(diagnostics.diagnostics()).resolves.toMatchObject({
      status: 'QUEUE_UNAVAILABLE',
      queueHealthy: false,
      available: false,
    });
  });

  it('converts Redis failures into a stable service error', async () => {
    const { diagnostics } = createTranscriptionFixture(null, {
      getJobCounts: jest.fn().mockRejectedValue(new Error('Redis is down')),
      getWorkers: jest.fn().mockResolvedValue([]),
    });

    await expect(diagnostics.diagnostics()).rejects.toMatchObject({
      status: 503,
      response: { code: 'REDIS_UNAVAILABLE' },
    });
  });
});
