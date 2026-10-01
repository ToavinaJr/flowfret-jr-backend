import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { delimiter, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type {
  TranscriptionJobData,
  WorkerMessage,
} from './entities/transcription.types';
import { parseWorkerMessage } from './transcriptions.utils';
import {
  TRANSCRIPTION_ERROR_CODE,
  WORKER_MESSAGE,
} from './transcriptions.constants';
import { WhisperWorkerConfigService } from './whisper-worker-config.service';

type WorkerInput = TranscriptionJobData & {
  title?: string;
  artist?: string;
  audioPath?: string;
};

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
  constructor(private readonly workerConfig: WhisperWorkerConfigService) {}

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
      const timer = setTimeout(() => {
        this.active = null;
        child.kill('SIGKILL');
        this.child = null;
        reject(
          Object.assign(new Error('Whisper timed out'), {
            code: TRANSCRIPTION_ERROR_CODE.WHISPER_TIMEOUT,
          }),
        );
      }, this.workerConfig.timeoutMs());
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
        `${JSON.stringify({ ...data, options: this.workerConfig.options() })}\n`,
      );
    });
  }

  onModuleDestroy(): void {
    this.child?.kill('SIGTERM');
    this.child = null;
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child && !this.child.killed) return this.child;
    const python = this.workerConfig.pythonBin();
    const script = resolve(
      process.cwd(),
      'workers/transcription/transcribe.py',
    );
    const ffmpegBinDir = this.workerConfig.ffmpegBinDir();
    const child = spawn(python, [script, '--server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        ...(ffmpegBinDir
          ? { PATH: `${ffmpegBinDir}${delimiter}${process.env.PATH ?? ''}` }
          : {}),
      },
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
          if (message.type !== WORKER_MESSAGE.SEGMENT)
            this.logger.log(
              JSON.stringify({
                event: 'whisper.message',
                transcriptionId: this.active.transcriptionId,
                type: message.type,
                progress:
                  message.type === WORKER_MESSAGE.PROGRESS
                    ? message.progress
                    : undefined,
              }),
            );
          await this.active.onMessage(message);
          if (message.type === WORKER_MESSAGE.COMPLETED) this.finish();
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
            { code: TRANSCRIPTION_ERROR_CODE.WHISPER_FAILED },
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
}
