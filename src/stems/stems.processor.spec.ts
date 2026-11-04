import { Logger } from '@nestjs/common';
import { MusicProvider } from '@prisma/client';
import { Job, UnrecoverableError } from 'bullmq';
import { StemsProcessor } from './stems.processor';
import { StemsRepository } from './stems.repository';
import { StemsAudioSourceService } from './stems-audio-source.service';
import { StemsBridgeService } from './stems-bridge.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { AudioStemJobData } from './entities/stem.types';

describe('StemsProcessor retry policy', () => {
  it('reclaims an interrupted job only when BullMQ reports it stalled', async () => {
    const { processor, job, repository } = fixture('AUDIO_DOWNLOAD_FAILED');
    job.stalledCounter = 1;
    await expect(processor.process(job)).rejects.toThrow();
    expect(repository.claimPending).toHaveBeenCalledWith('one', true);
  });
  function fixture(code: string) {
    const repository = {
      claimPending: jest.fn().mockResolvedValue(true),
      update: jest.fn().mockResolvedValue({}),
      markFailed: jest.fn().mockResolvedValue({}),
    };
    const cleanup = jest.fn().mockResolvedValue(undefined);
    const source = {
      extractYouTubeAudio: jest
        .fn()
        .mockResolvedValue({ audioPath: '/tmp/source', cleanup }),
    };
    const bridge = {
      separate: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('failure'), { code })),
    };
    const processor = new StemsProcessor(
      repository as unknown as StemsRepository,
      source as unknown as StemsAudioSourceService,
      bridge as unknown as StemsBridgeService,
      {} as CloudinaryService,
    );
    const job = {
      id: 'one',
      data: {
        audioStemId: 'one',
        provider: MusicProvider.YOUTUBE,
        trackId: 'video',
        audioUrl: '',
      },
      attemptsMade: 0,
      opts: { attempts: 2 },
    } as Job<AudioStemJobData>;
    return { processor, job, repository, cleanup };
  }

  it.each(['DEMUCS_TIMEOUT', 'AUDIO_TOO_LONG', 'AUDIO_TOO_LARGE'])(
    'does not automatically repeat %s',
    async (code) => {
      const { processor, job, repository, cleanup } = fixture(code);
      await expect(processor.process(job)).rejects.toBeInstanceOf(
        UnrecoverableError,
      );
      expect(repository.markFailed).toHaveBeenCalledWith(
        'one',
        code,
        expect.any(String),
      );
      expect(cleanup).toHaveBeenCalledTimes(1);
    },
  );

  it('records the failing stage and logs the real cause without exposing it', async () => {
    const { processor, job, repository } = fixture('DEMUCS_FAILED');
    job.opts.attempts = 1;
    const killed = new Error(
      'Demucs process exited without a result (code=137, signal=null) https://secret.example/x?token=abc',
    );
    (
      processor as unknown as { bridge: { separate: jest.Mock } }
    ).bridge.separate.mockRejectedValue(killed);
    const logged = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(processor.process(job)).rejects.toBe(killed);

    expect(repository.markFailed).toHaveBeenCalledWith(
      'one',
      'DEMUCS_FAILED',
      'Vocal separation failed (separate)',
    );
    const entry = JSON.parse(String(logged.mock.calls[0][0])) as Record<
      string,
      string
    >;
    expect(entry).toMatchObject({
      event: 'audio_stems.job_failed',
      stage: 'separate',
      errorCode: 'DEMUCS_FAILED',
    });
    expect(entry.errorDetail).toContain('code=137');
    expect(entry.errorDetail).not.toContain('secret.example');
    logged.mockRestore();
  });

  it('keeps retries for transient source failures and resets progress', async () => {
    const { processor, job, repository } = fixture('AUDIO_DOWNLOAD_FAILED');
    await expect(processor.process(job)).rejects.toMatchObject({
      code: 'AUDIO_DOWNLOAD_FAILED',
    });
    expect(repository.markFailed).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenLastCalledWith('one', {
      status: 'PENDING',
      progress: 0,
    });
  });
});
