import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { WhisperBridgeService } from './whisper-bridge.service';
import { WhisperWorkerConfigService } from './whisper-worker-config.service';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

function fakeChild() {
  const emitter = new EventEmitter();
  const stdinWrite = jest.fn();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const child = Object.assign(emitter, {
    stdin: { write: stdinWrite },
    stdout,
    stderr,
    kill: jest.fn(),
    killed: false,
    pid: 123,
  });
  return {
    child: child as unknown as ChildProcessWithoutNullStreams,
    emitter,
    stdinWrite,
    stdout,
  };
}

function setup() {
  const { child, emitter, stdinWrite, stdout } = fakeChild();
  jest.mocked(spawn).mockReturnValue(child);
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'WHISPER_PYTHON_BIN') return 'python-test';
      if (key === 'TRANSCRIPTION_TIMEOUT_MS') return '5000';
      return undefined;
    }),
  };
  const service = new WhisperBridgeService(
    new WhisperWorkerConfigService(config as unknown as ConfigService),
  );
  const data = {
    transcriptionId: 'transcription-id',
    trackId: 'track-id',
    audioUrl: 'https://audio.audius.co/file.mp3',
    model: 'small',
  };
  return { child, emitter, stdinWrite, stdout, service, data };
}

describe('WhisperBridgeService process protocol', () => {
  afterEach(() => jest.resetAllMocks());

  it('serializes a job and resolves after a valid completed message', async () => {
    const { stdinWrite, stdout, service, data } = setup();
    const onMessage = jest.fn().mockResolvedValue(undefined);
    const completion = service.run(data, onMessage);

    expect(stdinWrite).toHaveBeenCalledWith(
      expect.stringContaining('"transcriptionId":"transcription-id"'),
    );
    stdout.write(
      `${JSON.stringify({
        type: 'completed',
        duration: 12,
        detectedLanguage: 'fr',
        lrc: '[00:00.00]Bonjour',
      })}\n`,
    );

    await expect(completion).resolves.toBeUndefined();
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'completed', duration: 12 }),
    );
    service.onModuleDestroy();
  });

  it('rejects concurrent work while one Python job is active', async () => {
    const { stdout, service, data } = setup();
    const first = service.run(data, jest.fn().mockResolvedValue(undefined));

    await expect(
      service.run(
        { ...data, transcriptionId: 'second-id' },
        jest.fn().mockResolvedValue(undefined),
      ),
    ).rejects.toThrow('Whisper bridge is busy');

    stdout.write(
      `${JSON.stringify({
        type: 'completed',
        duration: 1,
        detectedLanguage: 'en',
        lrc: '',
      })}\n`,
    );
    await first;
    service.onModuleDestroy();
  });

  it('rejects the active job if the Python process exits', async () => {
    const { emitter, service, data } = setup();
    const completion = service.run(
      data,
      jest.fn().mockResolvedValue(undefined),
    );
    const rejection = expect(completion).rejects.toMatchObject({
      code: 'WHISPER_FAILED',
    });

    emitter.emit('close', 1);

    await rejection;
  });
});
