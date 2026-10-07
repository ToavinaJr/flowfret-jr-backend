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

  separate(input: {
    audioStemId: string;
    audioUrl?: string;
    audioPath?: string;
  }): Promise<SeparationResult> {
    const python = this.workerConfig.pythonBin();
    const script = resolve(process.cwd(), 'workers/stems/separate.py');
    const options = this.workerConfig.options();
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
      });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(
          Object.assign(new Error('Demucs timed out'), {
            code: STEMS_ERROR_CODE.DEMUCS_TIMEOUT,
          }),
        );
      }, options.timeoutMs);
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
          settle(() =>
            reject(
              Object.assign(new Error(String(message.message)), {
                code: message.errorCode ?? STEMS_ERROR_CODE.DEMUCS_FAILED,
              }),
            ),
          );
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
      child.on('close', (code) => {
        settle(() => {
          if (code !== 0)
            reject(
              Object.assign(
                new Error(`Demucs process exited (${code ?? 'unknown'})`),
                {
                  code: STEMS_ERROR_CODE.DEMUCS_FAILED,
                },
              ),
            );
        });
      });
      child.stdin.write(`${JSON.stringify({ ...input, options })}\n`);
      child.stdin.end();
    });
  }
}
