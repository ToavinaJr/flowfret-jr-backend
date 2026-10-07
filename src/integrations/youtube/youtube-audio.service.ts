import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
import { PassThrough, type Readable } from 'node:stream';
import { YOUTUBE_VIDEO_ID_PATTERN } from './youtube.constants';

export interface YouTubeAudioStream {
  stream: Readable;
  dispose: () => void;
}

@Injectable()
export class YouTubeAudioService implements OnModuleInit {
  private readonly logger = new Logger(YouTubeAudioService.name);
  private activeExtractions = 0;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    try {
      const cookieFile = this.cookieFile();
      this.logger.log(
        JSON.stringify({
          event: 'youtube.extractor_config',
          python: this.pythonBinary(),
          bundledPythonPackagesPresent: existsSync(
            resolve(process.cwd(), '.python-packages', 'yt_dlp'),
          ),
          cookiesConfigured: Boolean(cookieFile),
          ...(cookieFile ? this.cookieDiagnostics(cookieFile) : {}),
        }),
      );
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'youtube.extractor_config_invalid',
          reason:
            error instanceof Error
              ? error.message
              : 'Unknown configuration error',
        }),
      );
    }
  }

  createStream(videoId: string, diagnosticId?: string): YouTubeAudioStream {
    if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
      throw new BadRequestException('Invalid YouTube video id');
    }
    const maxConcurrent = this.number('YOUTUBE_AUDIO_MAX_CONCURRENT', 2);
    const cookieFile = this.cookieFile();
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
    const writableCookieFile = cookieFile
      ? this.writableCookieCopy(cookieFile)
      : undefined;

    const python = this.pythonBinary();
    const maxBytes = this.number('YOUTUBE_AUDIO_MAX_SIZE_MB', 30) * 1024 * 1024;
    const maxDuration = Math.min(
      300,
      this.number('YOUTUBE_AUDIO_MAX_DURATION_SECONDS', 300),
    );
    const timeoutMs = this.number('YOUTUBE_AUDIO_DOWNLOAD_TIMEOUT_MS', 120_000);
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const bundledPythonPackages = resolve(process.cwd(), '.python-packages');
    const pythonPath = [bundledPythonPackages, process.env.PYTHONPATH]
      .filter(Boolean)
      .join(delimiter);
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
        ...(writableCookieFile ? ['--cookies', writableCookieFile.path] : []),
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
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, PYTHONPATH: pythonPath },
      },
    );
    const startedAt = Date.now();
    this.logger.log(
      JSON.stringify({
        event: 'youtube.audio_extraction_started',
        diagnosticId,
        videoId,
        cookiesConfigured: Boolean(cookieFile),
        activeExtractions: this.activeExtractions,
        maxBytes,
        maxDuration,
        timeoutMs,
      }),
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
      writableCookieFile?.cleanup();
      release();
    };
    const fail = (message: string, code = 'YOUTUBE_AUDIO_EXTRACTION_FAILED') => {
      if (finished) return;
      dispose();
      output.destroy(
        Object.assign(new BadGatewayException(message), { code }),
      );
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
          diagnosticId,
          videoId,
          errorName: error.name,
          errorMessage: error.message,
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
        this.logger.log(
          JSON.stringify({
            event: 'youtube.audio_extraction_succeeded',
            diagnosticId,
            videoId,
            bytes,
            durationMs: Date.now() - startedAt,
          }),
        );
        output.end();
        return;
      }
      const detail = this.safeExtractorDetail(stderr);
      this.logger.warn(
        JSON.stringify({
          event: 'youtube.audio_extraction_failed',
          diagnosticId,
          videoId,
          code,
          category: this.extractorFailureCategory(stderr),
          durationMs: Date.now() - startedAt,
          bytes,
          detail,
        }),
      );
      const category = this.extractorFailureCategory(stderr);
      output.destroy(
        Object.assign(
          new BadGatewayException(
            category === 'duration_limit_exceeded'
              ? 'Video exceeds the maximum transcription duration'
              : 'YouTube audio extraction failed',
          ),
          {
            code:
              category === 'duration_limit_exceeded'
                ? 'AUDIO_TOO_LONG'
                : 'YOUTUBE_AUDIO_EXTRACTION_FAILED',
          },
        ),
      );
    });
    output.on('close', dispose);

    return { stream: output, dispose };
  }

  private number(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private pythonBinary(): string {
    return (
      this.config.get<string>('YOUTUBE_DL_PYTHON_BIN')?.trim() ||
      this.config.get<string>('WHISPER_PYTHON_BIN')?.trim() ||
      'python3'
    );
  }

  private writableCookieCopy(sourcePath: string): {
    path: string;
    cleanup: () => void;
  } {
    const baseTempDir =
      this.config.get<string>('TRANSCRIPTION_TEMP_DIR')?.trim() || tmpdir();
    const directory = mkdtempSync(join(baseTempDir, 'yt-cookies-'));
    const path = join(directory, 'cookies.txt');
    copyFileSync(sourcePath, path);
    return {
      path,
      cleanup: () => rmSync(directory, { recursive: true, force: true }),
    };
  }

  private cookieFile(): string | undefined {
    const configured = this.config.get<string>('YOUTUBE_COOKIES_FILE')?.trim();
    if (!configured) return undefined;
    const path = isAbsolute(configured)
      ? configured
      : resolve(process.cwd(), configured);
    if (!existsSync(path)) {
      throw new ServiceUnavailableException(
        'Configured YouTube cookies file is unavailable',
      );
    }
    const diagnostics = this.cookieDiagnostics(path);
    if (!diagnostics.headerValid || diagnostics.cookieRows === 0) {
      throw new ServiceUnavailableException(
        'Configured YouTube cookies file is empty or invalid',
      );
    }
    return path;
  }

  private cookieDiagnostics(path: string): {
    cookieFileBytes: number;
    cookieRows: number;
    headerValid: boolean;
  } {
    const content = readFileSync(path, 'utf8');
    const firstLine = content.split(/\r?\n/, 1)[0]?.trim();
    const cookieRows = content.split(/\r?\n/).filter((line) => {
      const candidate = line.trim();
      return (
        Boolean(candidate) &&
        (!candidate.startsWith('#') || candidate.startsWith('#HttpOnly_')) &&
        candidate.split('\t').length >= 7
      );
    }).length;
    return {
      cookieFileBytes: statSync(path).size,
      cookieRows,
      headerValid:
        firstLine === '# Netscape HTTP Cookie File' ||
        firstLine === '# HTTP Cookie File',
    };
  }

  private extractorFailureCategory(stderr: string): string {
    if (/does not pass filter|duration.{0,30}(?:limit|long)|longer than/i.test(stderr)) {
      return 'duration_limit_exceeded';
    }
    if (/sign in to confirm|not a bot|login required/i.test(stderr)) {
      return 'youtube_authentication_required';
    }
    if (/cookie.*(?:expired|invalid)|invalid.*cookie/i.test(stderr)) {
      return 'youtube_cookies_invalid';
    }
    if (
      /no module named yt_dlp|module specification for 'yt_dlp'/i.test(stderr)
    ) {
      return 'yt_dlp_missing';
    }
    if (/no supported javascript runtime|javascript runtime/i.test(stderr)) {
      return 'javascript_runtime_unavailable';
    }
    if (/unable to download|network|timed?\s*out|connection/i.test(stderr)) {
      return 'youtube_network_failure';
    }
    if (/requested format is not available|no video formats/i.test(stderr)) {
      return 'audio_format_unavailable';
    }
    return 'unknown_extractor_failure';
  }

  private safeExtractorDetail(stderr: string): string {
    return stderr
      .replace(/https?:\/\/\S+/gi, '[redacted-url]')
      .replace(/(cookie|authorization):\s*\S+/gi, '$1: [redacted]')
      .trim()
      .slice(-800);
  }
}
