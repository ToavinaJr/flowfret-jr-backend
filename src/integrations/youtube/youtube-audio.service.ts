import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { PassThrough, type Readable } from 'node:stream';
import { YOUTUBE_VIDEO_ID_PATTERN } from './youtube.constants';

export interface YouTubeAudioStream {
  stream: Readable;
  dispose: () => void;
}

@Injectable()
export class YouTubeAudioService {
  private readonly logger = new Logger(YouTubeAudioService.name);
  private activeExtractions = 0;

  constructor(private readonly config: ConfigService) {}

  createStream(videoId: string): YouTubeAudioStream {
    if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
      throw new BadRequestException('Invalid YouTube video id');
    }
    const maxConcurrent = this.number('YOUTUBE_AUDIO_MAX_CONCURRENT', 2);
    if (this.activeExtractions >= maxConcurrent) {
      throw new ServiceUnavailableException(
        'YouTube audio extraction capacity is full',
      );
    }
    this.activeExtractions += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.activeExtractions = Math.max(0, this.activeExtractions - 1);
    };

    const python =
      this.config.get<string>('YOUTUBE_DL_PYTHON_BIN')?.trim() ||
      this.config.get<string>('WHISPER_PYTHON_BIN')?.trim() ||
      'python3';
    const maxBytes = this.number('YOUTUBE_AUDIO_MAX_SIZE_MB', 30) * 1024 * 1024;
    const maxDuration = this.number('YOUTUBE_AUDIO_MAX_DURATION_SECONDS', 600);
    const timeoutMs = this.number('YOUTUBE_AUDIO_DOWNLOAD_TIMEOUT_MS', 120_000);
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const child = spawn(
      python,
      [
        '-m',
        'yt_dlp',
        '--no-playlist',
        '--quiet',
        '--no-warnings',
        '--no-progress',
        '--js-runtimes',
        'node',
        '--format',
        'ba[ext=m4a]/ba[ext=webm]/ba/b',
        '--match-filter',
        `duration <= ${maxDuration}`,
        '--max-filesize',
        `${Math.ceil(maxBytes / (1024 * 1024))}M`,
        '--output',
        '-',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    const output = new PassThrough();
    let bytes = 0;
    let finished = false;
    let stderr = '';

    const dispose = () => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        if (!child.killed) child.kill('SIGKILL');
      }
      release();
    };
    const fail = (message: string) => {
      if (finished) return;
      dispose();
      output.destroy(new BadGatewayException(message));
    };
    const timer = setTimeout(
      () => fail('YouTube audio extraction timed out'),
      timeoutMs,
    );

    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        fail('YouTube audio exceeds the configured size limit');
        return;
      }
      if (!output.write(chunk)) child.stdout.pause();
    });
    output.on('drain', () => child.stdout.resume());
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-2000);
    });
    child.on('error', (error) => {
      this.logger.error(
        JSON.stringify({
          event: 'youtube.audio_process_error',
          videoId,
          errorName: error.name,
        }),
      );
      fail('YouTube audio extractor is unavailable');
    });
    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      release();
      if (code === 0 && bytes > 0) {
        output.end();
        return;
      }
      this.logger.warn(
        JSON.stringify({
          event: 'youtube.audio_extraction_failed',
          videoId,
          code,
          detail: stderr.replace(/https?:\/\/\S+/gi, '[redacted-url]').trim(),
        }),
      );
      output.destroy(
        new BadGatewayException('YouTube audio extraction failed'),
      );
    });
    output.on('close', dispose);

    return { stream: output, dispose };
  }

  private number(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
