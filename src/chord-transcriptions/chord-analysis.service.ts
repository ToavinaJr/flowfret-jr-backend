import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { ChordAnalysisConfigService } from './chord-analysis-config.service';
import {
  parseChordAnalysisResult,
  type ChordAnalysisResult,
} from './chord-analysis-result';

const execute = promisify(execFile);
export const MAX_CHORD_AUDIO_BYTES = 20 * 1024 * 1024;

@Injectable()
export class ChordAnalysisService {
  private readonly logger = new Logger(ChordAnalysisService.name);
  private busy = false;
  private readonly cache = new Map<string, ChordAnalysisResult>();

  constructor(private readonly config: ChordAnalysisConfigService) {}

  async analyze(buffer: Buffer): Promise<ChordAnalysisResult> {
    if (!buffer.length || buffer.length > MAX_CHORD_AUDIO_BYTES)
      throw new BadRequestException('Invalid audio size');
    if (!this.config.enabled)
      throw new ServiceUnavailableException('CHORD_ANALYSIS_UNAVAILABLE');
    const key = createHash('sha256').update(buffer).digest('hex');
    const cached = this.cache.get(key);
    if (cached) return cached;
    if (this.busy) throw new ServiceUnavailableException('CHORD_ANALYSIS_BUSY');
    this.busy = true;
    let directory: string | undefined;
    try {
      directory = await mkdtemp(join(tmpdir(), 'flowfret-chords-'));
      const file = join(directory, 'audio');
      await writeFile(file, buffer);
      const { stdout } = await execute(
        this.config.python,
        [
          resolve('workers/chords/analyze.py'),
          '--audio',
          file,
          '--models',
          this.config.modelDirectory,
        ],
        {
          timeout: this.config.timeoutMs,
          maxBuffer: 4 * 1024 * 1024,
          windowsHide: true,
        },
      );
      const result = parseChordAnalysisResult(JSON.parse(stdout) as unknown);
      if (this.cache.size >= 16)
        this.cache.delete(String(this.cache.keys().next().value));
      this.cache.set(key, result);
      return result;
    } catch {
      this.logger.warn('chords.neural_analysis_failed');
      throw new ServiceUnavailableException('CHORD_ANALYSIS_FAILED');
    } finally {
      this.busy = false;
      if (directory)
        await rm(directory, { recursive: true, force: true }).catch(() =>
          this.logger.warn('chords.temp_cleanup_failed'),
        );
    }
  }
}
