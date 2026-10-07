import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_DEMUCS_MODEL } from './stems.constants';

@Injectable()
export class StemsWorkerConfigService {
  constructor(private readonly config: ConfigService) {}

  pythonBin(): string {
    return this.config.get<string>('WHISPER_PYTHON_BIN') ?? 'python3';
  }

  timeoutMs(): number {
    return this.number('AUDIO_STEMS_TIMEOUT_MS', 600_000);
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
      model: this.config.get<string>('DEMUCS_MODEL') ?? DEFAULT_DEMUCS_MODEL,
      mp3Bitrate: this.number('AUDIO_STEMS_MP3_BITRATE', 192),
      maxAudioSizeMb: this.number('TRANSCRIPTION_MAX_AUDIO_SIZE_MB', 100),
      maxDurationSeconds: this.number('AUDIO_STEMS_MAX_DURATION_SECONDS', 420),
      maxRedirects: this.number('TRANSCRIPTION_MAX_REDIRECTS', 3),
      downloadTimeoutMs: this.number(
        'TRANSCRIPTION_DOWNLOAD_TIMEOUT_MS',
        120_000,
      ),
      allowedHosts: [...new Set([...defaultHosts, ...configured])],
      tempDir: this.config.get<string>('AUDIO_STEMS_TEMP_DIR') || undefined,
      timeoutMs: this.timeoutMs(),
    };
  }

  private number(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
