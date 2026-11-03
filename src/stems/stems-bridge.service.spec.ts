import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { StemsBridgeService } from './stems-bridge.service';
import { StemsWorkerConfigService } from './stems-worker-config.service';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

describe('StemsBridgeService protocol', () => {
  function fixture() {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: jest.fn(),
    });
    jest
      .mocked(spawn)
      .mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const config = {
      pythonBin: () => 'python3',
      options: () => ({
        timeoutMs: 100,
        downloadTimeoutMs: 100,
        model: 'htdemucs',
        cpuThreads: 2,
      }),
    };
    const service = new StemsBridgeService(
      config as unknown as StemsWorkerConfigService,
    );
    return { child, service };
  }

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it.each([
    ['uvr-demo-v1', 'uvr-demo'],
    ['uvr-mdx-0.48.0-voc-ft-v1', 'uvr-mdx'],
    ['uvr-ensemble-0.48.0-voc-ft-v1', 'uvr-ensemble'],
  ])('selects the engine for version %s', async (engineVersion, model) => {
    const { child, service } = fixture();
    const result = service.separate({
      audioStemId: 'demo',
      engineVersion,
    });
    const data: unknown = child.stdin.read();
    if (!Buffer.isBuffer(data)) throw new Error('Missing worker request');
    const sent = JSON.parse(data.toString('utf8')) as {
      options: { model: string };
    };
    expect(sent.options.model).toBe(model);
    child.emit('close', 0, null);
    await expect(result).rejects.toThrow('without a result');
  });

  it('rejects a clean exit with no result instead of hanging forever', async () => {
    const { child, service } = fixture();
    const result = service.separate({ audioStemId: 'one' });
    child.emit('close', 0, null);
    await expect(result).rejects.toThrow('without a result');
  });

  it('propagates progress and preserves the worker error code and detail', async () => {
    const { child, service } = fixture();
    const progress = jest.fn();
    const result = service.separate({ audioStemId: 'one' }, progress);
    child.stdout.write(
      JSON.stringify({ type: 'started', duration: 120 }) + '\n',
    );
    child.stdout.write(
      JSON.stringify({ type: 'progress', progress: 47 }) + '\n',
    );
    child.stdout.write(
      JSON.stringify({
        type: 'failed',
        errorCode: 'DEMUCS_TIMEOUT',
        message: 'specific failure',
      }) + '\n',
    );
    await expect(result).rejects.toMatchObject({
      code: 'DEMUCS_TIMEOUT',
      message: 'specific failure',
    });
    expect(progress.mock.calls).toEqual([[5], [47]]);
  });

  it('resolves both output paths and ignores the subsequent process close', async () => {
    const { child, service } = fixture();
    const result = service.separate({ audioStemId: 'one' });
    const payload = {
      duration: 120,
      vocalsPath: '/tmp/v.mp3',
      instrumentalPath: '/tmp/i.mp3',
      tempDir: '/tmp/stem',
    };
    child.stdout.write(
      JSON.stringify({ type: 'completed', ...payload }) + '\n',
    );
    child.emit('close', 0, null);
    await expect(result).resolves.toEqual(payload);
  });

  it('enforces the outer deadline if the worker never responds', async () => {
    jest.useFakeTimers();
    const { service } = fixture();
    const result = service.separate({ audioStemId: 'one' });
    const assertion = expect(result).rejects.toMatchObject({
      code: 'DEMUCS_TIMEOUT',
    });
    jest.advanceTimersByTime(60_200);
    await assertion;
  });
});
