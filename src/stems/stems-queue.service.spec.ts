import { ConfigService } from '@nestjs/config';
import { AudioStem } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { AudioStemJobData } from './entities/stem.types';
import { StemsQueueService } from './stems-queue.service';

describe('StemsQueueService retry', () => {
  it('retries the retained failed job rather than adding its duplicate ID', async () => {
    const retry = jest.fn().mockResolvedValue(undefined);
    const queue = {
      getJob: jest.fn().mockResolvedValue({
        getState: jest.fn().mockResolvedValue('failed'),
        retry,
      }),
      add: jest.fn(),
    };
    const service = new StemsQueueService(
      new ConfigService(),
      queue as unknown as Queue<AudioStemJobData>,
    );
    await expect(
      service.enqueue(
        { id: 'stem-1' } as AudioStem,
        'https://audio.example.test/source',
      ),
    ).resolves.toBe('stem-1');
    expect(retry).toHaveBeenCalledTimes(1);
    expect(queue.add).not.toHaveBeenCalled();
  });
  it('reports unavailable storage without leaving the request hanging', async () => {
    const queue = { getJob: jest.fn().mockRejectedValue(new Error('offline')) };
    const service = new StemsQueueService(
      new ConfigService(),
      queue as unknown as Queue<AudioStemJobData>,
    );
    await expect(
      service.enqueue(
        { id: 'stem-1' } as AudioStem,
        'https://audio.example.test/source',
      ),
    ).rejects.toMatchObject({
      response: { code: 'REDIS_UNAVAILABLE' },
    });
  });
});
