import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { StemsWorkerConfigService } from './stems-worker-config.service';
import { STEMS_ERROR_CODE } from './stems.constants';

export interface SeparationResult {
  duration: number;
  vocalsPath: string;
  instrumentalPath: string;
  tempDir: string;
}

@Injectable()
export class StemsBridgeService {
  private readonly logger = new Logger(StemsBridgeService.name);

  constructor(private readonly workerConfig: StemsWorkerConfigService) {}

  separate(
    input: {
      audioStemId: string;
      audioUrl?: string;
      audioPath?: string;
      engineVersion?: string;
    },
    onProgress?: (progress: number) => void,
  ): Promise<SeparationResult> {
    const python = this.workerConfig.pythonBin();
    const script = resolve(process.cwd(), 'workers/stems/separate.py');
    const options = this.workerConfig.options();
    // The queued job owns its engine: changing server configuration must not
    // silently turn an older Demucs job into a simulated separation.
    if (input.engineVersion === 'uvr-demo-v1') options.model = 'uvr-demo';
    if (input.engineVersion === 'uvr-mdx-0.48.0-voc-ft-v1')
      options.model = 'uvr-mdx';
    if (input.engineVersion === 'uvr-ensemble-0.48.0-voc-ft-v1')
      options.model = 'uvr-ensemble';
    this.logger.log(
      JSON.stringify({
        event: 'audio_stems.job_sent',
        audioStemId: input.audioStemId,
        model: options.model,
      }),
    );
    return new Promise<SeparationResult>((resolvePromise, reject) => {
      const child = spawn(python, [script], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
      });
      const terminate = () => {
        if (!child.pid) return;
        if (process.platform === 'win32') {
          const killer = spawn(
            'taskkill',
            ['/pid', String(child.pid), '/T', '/F'],
            {
              windowsHide: true,
              stdio: 'ignore',
            },
          );
          killer.on('error', () => child.kill());
        } else {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
              child.kill('SIGKILL');
          }
        }
      };
      const timer = setTimeout(
        () => {
          terminate();
          settle(() =>
            reject(
              Object.assign(new Error('Demucs timed out'), {
                code: STEMS_ERROR_CODE.DEMUCS_TIMEOUT,
              }),
            ),
          );
        },
        options.timeoutMs + options.downloadTimeoutMs + 60_000,
      );
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      createInterface({ input: child.stdout }).on('line', (line) => {
        if (!line.trim()) return;
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }
        if (message.type === 'completed') {
          settle(() =>
            resolvePromise({
              duration: Number(message.duration),
              vocalsPath: String(message.vocalsPath),
              instrumentalPath: String(message.instrumentalPath),
              tempDir: String(message.tempDir),
            }),
          );
        } else if (message.type === 'failed') {
          this.logger.error(
            JSON.stringify({
              event: 'audio_stems.separation_failed',
              audioStemId: input.audioStemId,
              errorCode: message.errorCode,
              detail: String(message.message)
                .replace(/https?:\/\/\S+/gi, '[redacted-url]')
                .slice(-2000),
            }),
          );
          settle(() =>
            reject(
              Object.assign(new Error(String(message.message)), {
                code: message.errorCode ?? STEMS_ERROR_CODE.DEMUCS_FAILED,
              }),
            ),
          );
        } else if (message.type === 'started') {
          this.logger.log(
            JSON.stringify({
              event: 'audio_stems.separation_started',
              audioStemId: input.audioStemId,
              duration: message.duration,
              cpuThreads: options.cpuThreads,
            }),
          );
          onProgress?.(5);
        } else if (
          message.type === 'progress' &&
          typeof message.progress === 'number' &&
          Number.isFinite(message.progress)
        ) {
          onProgress?.(Math.max(5, Math.min(90, message.progress)));
        }
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
              event: 'audio_stems.stderr',
              audioStemId: input.audioStemId,
              output,
            }),
          );
      });
      child.on('error', (error) => {
        settle(() =>
          reject(
            Object.assign(error, { code: STEMS_ERROR_CODE.DEMUCS_FAILED }),
          ),
        );
      });
      child.on('close', (code, signal) => {
        settle(() => {
          reject(
            Object.assign(
              new Error(
                `Demucs process exited without a result (code=${code}, signal=${signal})`,
              ),
              {
                code: STEMS_ERROR_CODE.DEMUCS_FAILED,
              },
            ),
          );
        });
      });
      child.stdin.on('error', (error) => {
        terminate();
        settle(() =>
          reject(
            Object.assign(error, { code: STEMS_ERROR_CODE.DEMUCS_FAILED }),
          ),
        );
      });
      child.stdin.write(`${JSON.stringify({ ...input, options })}\n`);
      child.stdin.end();
    });
  }
}
