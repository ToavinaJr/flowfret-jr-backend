import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { YouTubeAudioService } from './youtube-audio.service';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

describe('YouTube duration policy isolation', () => {
  it.each([
    [undefined, 'duration <= 300'],
    [{ maxDurationSeconds: 420 }, 'duration <= 420'],
  ])('uses the appropriate duration filter for %p', (limits, expected) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: jest.fn(),
    });
    jest
      .mocked(spawn)
      .mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const service = new YouTubeAudioService(new ConfigService({}));
    const extraction = service.createStream('x77VucXB4jo', 'test', limits);
    try {
      expect(spawn).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.arrayContaining(['--match-filter', expected]),
        expect.any(Object),
      );
    } finally {
      extraction.dispose();
    }
  });

  it('rejects an invalid override before starting a process', () => {
    jest.mocked(spawn).mockClear();
    const service = new YouTubeAudioService(new ConfigService({}));
    expect(() =>
      service.createStream('x77VucXB4jo', 'test', { maxDurationSeconds: 0 }),
    ).toThrow('Invalid audio duration limit');
    expect(spawn).not.toHaveBeenCalled();
  });
});
