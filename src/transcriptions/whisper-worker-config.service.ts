import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WhisperWorkerConfigService {
  constructor(private readonly config: ConfigService) {}

  pythonBin(): string {
    return this.config.get<string>('WHISPER_PYTHON_BIN') ?? 'python3';
  }

  ffmpegBinDir(): string | undefined {
    return this.config.get<string>('FFMPEG_BIN_DIR')?.trim() || undefined;
  }

  timeoutMs(): number {
    return this.number('TRANSCRIPTION_TIMEOUT_MS', 900_000);
  }

  options() {
    const configured = (
      this.config.get<string>('TRANSCRIPTION_ALLOWED_AUDIO_HOSTS') ?? ''
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const defaultHosts = [
      'audius.co',
      'audius.work',
      'audiuscontent.co',
      'theblueprint.xyz',
      'zeogrid.com',
      'staked.cloud',
      'altego.net',
    ];
    return {
      device: this.config.get<string>('WHISPER_DEVICE') ?? 'cpu',
      computeType: this.config.get<string>('WHISPER_COMPUTE_TYPE') ?? 'int8',
      initialBufferSeconds: this.number(
        'TRANSCRIPTION_INITIAL_BUFFER_SECONDS',
        45,
      ),
      maxAudioSizeMb: this.number('TRANSCRIPTION_MAX_AUDIO_SIZE_MB', 100),
      maxDurationSeconds: Math.min(
        300,
        this.number('TRANSCRIPTION_MAX_DURATION_SECONDS', 300),
      ),
      maxRedirects: this.number('TRANSCRIPTION_MAX_REDIRECTS', 3),
      downloadTimeoutMs: this.number(
        'TRANSCRIPTION_DOWNLOAD_TIMEOUT_MS',
        120_000,
      ),
      allowedHosts: [...new Set([...defaultHosts, ...configured])],
      tempDir: this.config.get<string>('TRANSCRIPTION_TEMP_DIR') || undefined,
    };
  }

  private number(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
