import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type {
  TranscriptionJobData,
  WorkerMessage,
} from './entities/transcription.types';
import { parseWorkerMessage } from './transcriptions.utils';

type WorkerInput = TranscriptionJobData & { title?: string; artist?: string };

@Injectable()
export class WhisperBridgeService implements OnModuleDestroy {
  private readonly logger = new Logger(WhisperBridgeService.name);
  private child: ChildProcessWithoutNullStreams | null = null;
  private active: {
    onMessage: (message: WorkerMessage) => Promise<void>;
    transcriptionId: string;
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private chain = Promise.resolve();
  constructor(private readonly config: ConfigService) {}

  run(
    data: WorkerInput,
    onMessage: (message: WorkerMessage) => Promise<void>,
  ): Promise<void> {
    if (this.active) {
      this.logger.error(
        JSON.stringify({
          event: 'whisper.bridge_busy',
          transcriptionId: data.transcriptionId,
          activeTranscriptionId: this.active.transcriptionId,
        }),
      );
      return Promise.reject(new Error('Whisper bridge is busy'));
    }
    const child = this.ensureChild();
    return new Promise<void>((resolvePromise, reject) => {
      const timer = setTimeout(
        () => {
          this.active = null;
          child.kill('SIGKILL');
          this.child = null;
          reject(
            Object.assign(new Error('Whisper timed out'), {
              code: 'WHISPER_TIMEOUT',
            }),
          );
        },
        this.numberConfig('TRANSCRIPTION_TIMEOUT_MS', 900_000),
      );
      this.active = {
        onMessage,
        transcriptionId: data.transcriptionId,
        resolve: resolvePromise,
        reject,
        timer,
      };
      this.logger.log(
        JSON.stringify({
          event: 'whisper.job_sent',
          transcriptionId: data.transcriptionId,
          trackId: data.trackId,
          model: data.model,
          pythonPid: child.pid,
        }),
      );
      child.stdin.write(
        `${JSON.stringify({ ...data, options: this.workerOptions() })}\n`,
      );
    });
  }

  onModuleDestroy(): void {
    this.child?.kill('SIGTERM');
    this.child = null;
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child && !this.child.killed) return this.child;
    const python = this.config.get<string>('WHISPER_PYTHON_BIN') ?? 'python3';
    const script = resolve(
      process.cwd(),
      'workers/transcription/transcribe.py',
    );
    const child = spawn(python, [script, '--server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
    this.logger.log(
      JSON.stringify({
        event: 'whisper.process_spawned',
        python,
        script,
        pythonPid: child.pid,
      }),
    );
    this.child = child;
    createInterface({ input: child.stdout }).on('line', (line) => {
      if (!line.trim() || !this.active) return;
      this.chain = this.chain
        .then(async () => {
          if (!this.active) return;
          const message = parseWorkerMessage(line);
          if (message.type !== 'segment')
            this.logger.log(
              JSON.stringify({
                event: 'whisper.message',
                transcriptionId: this.active.transcriptionId,
                type: message.type,
                progress:
                  message.type === 'progress' ? message.progress : undefined,
              }),
            );
          await this.active.onMessage(message);
          if (message.type === 'completed') this.finish();
        })
        .catch((error: unknown) =>
          this.fail(
            error instanceof Error
              ? error
              : new Error('Invalid worker response'),
          ),
        );
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const output = chunk
        .toString('utf8')
        .replace(/https?:\/\/\S+/gi, '[redacted-url]')
        .trim()
        .slice(0, 2000);
      if (output)
        this.logger.warn(
          JSON.stringify({
            event: 'whisper.stderr',
            transcriptionId: this.active?.transcriptionId,
            output,
          }),
        );
    });
    child.on('error', (error) => {
      this.logger.error(
        JSON.stringify({
          event: 'whisper.process_error',
          error: error.message,
        }),
      );
      this.fail(error);
    });
    child.on('close', (code) => {
      this.logger.warn(
        JSON.stringify({
          event: 'whisper.process_closed',
          transcriptionId: this.active?.transcriptionId,
          code,
        }),
      );
      this.child = null;
      if (this.active)
        this.fail(
          Object.assign(
            new Error(`Whisper process exited (${code ?? 'unknown'})`),
            { code: 'WHISPER_FAILED' },
          ),
        );
    });
    return child;
  }

  private finish(): void {
    if (!this.active) return;
    clearTimeout(this.active.timer);
    const resolvePromise = this.active.resolve;
    this.active = null;
    resolvePromise();
  }
  private fail(error: Error): void {
    if (!this.active) return;
    clearTimeout(this.active.timer);
    const reject = this.active.reject;
    this.active = null;
    reject(error);
  }
  private workerOptions() {
    return {
      device: this.config.get<string>('WHISPER_DEVICE') ?? 'cpu',
      computeType: this.config.get<string>('WHISPER_COMPUTE_TYPE') ?? 'int8',
      initialBufferSeconds: this.numberConfig(
        'TRANSCRIPTION_INITIAL_BUFFER_SECONDS',
        45,
      ),
      maxAudioSizeMb: this.numberConfig('TRANSCRIPTION_MAX_AUDIO_SIZE_MB', 100),
      maxRedirects: this.numberConfig('TRANSCRIPTION_MAX_REDIRECTS', 3),
      downloadTimeoutMs: this.numberConfig(
        'TRANSCRIPTION_DOWNLOAD_TIMEOUT_MS',
        120_000,
      ),
      allowedHosts: (
        this.config.get<string>('TRANSCRIPTION_ALLOWED_AUDIO_HOSTS') ?? ''
      )
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      tempDir: this.config.get<string>('TRANSCRIPTION_TEMP_DIR') || undefined,
    };
  }
  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
