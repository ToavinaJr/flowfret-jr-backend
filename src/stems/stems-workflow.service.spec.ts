import { ConfigService } from '@nestjs/config';
import { AudioStemStatus, MusicProvider } from '@prisma/client';
import { StemsWorkflowService } from './stems-workflow.service';
import { StemsRepository } from './stems.repository';
import { StemsQueueService } from './stems-queue.service';
import { StemsCapacityService } from './stems-capacity.service';

function fixture(status: AudioStemStatus, attempts = 0, engine = 'demucs') {
  const row = {
    id: 'stem-1',
    status,
    attempts,
    progress: 100,
    provider: MusicProvider.AUDIUS,
    trackId: 'track',
    vocalsUrl: 'https://cdn.example.test/vocals.mp3',
    instrumentalUrl: 'https://cdn.example.test/backing.mp3',
  };
  const repository = {
    findCompatible: jest.fn().mockResolvedValue(row),
    update: jest.fn().mockResolvedValue({ ...row, status: 'PENDING' }),
  };
  const queue = { enqueue: jest.fn().mockResolvedValue('stem-1') };
  const capacity = { ensure: jest.fn() };
  const service = new StemsWorkflowService(
    repository as unknown as StemsRepository,
    new ConfigService({ AUDIO_STEMS_ENGINE: engine }),
    queue as unknown as StemsQueueService,
    capacity as unknown as StemsCapacityService,
  );
  return { service, repository, queue };
}

describe('StemsWorkflowService', () => {
  const request = {
    trackId: 'track',
    provider: MusicProvider.AUDIUS,
    audioUrl: 'https://audius.co/stream',
  };
  it.each(['uvr-mdx', 'uvr-ensemble'])(
    'isolates the cache for %s',
    async (engine) => {
      const { service, repository } = fixture('COMPLETED', 0, engine);
      await service.createOrGet(request);
      expect(repository.findCompatible).toHaveBeenCalledWith(
        MusicProvider.AUDIUS,
        'track',
        `${engine}-0.48.0-voc-ft-v1`,
      );
    },
  );
  it('returns cached stems without another expensive separation', async () => {
    const { service, queue } = fixture('COMPLETED');
    expect(await service.createOrGet(request)).toMatchObject({
      cached: true,
      status: 'COMPLETED',
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
  it('does not enqueue an already processing track', async () => {
    const { service, queue } = fixture('PROCESSING');
    await service.createOrGet(request);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
  it('resets failed work before requeueing and enforces the retry limit', async () => {
    const { service, repository, queue } = fixture('FAILED', 1);
    await service.createOrGet(request);
    expect(repository.update).toHaveBeenCalledWith(
      'stem-1',
      expect.objectContaining({ status: 'PENDING' }),
    );
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    await expect(
      fixture('FAILED', 3).service.createOrGet(request),
    ).rejects.toMatchObject({ status: 409 });
  });
});
