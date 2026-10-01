import { BadRequestException, Injectable } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { MusicProvider } from '@prisma/client';
import { AudiusService } from '../integrations/audius/audius.service';
import { YouTubeAudioService } from '../integrations/youtube/youtube-audio.service';

export interface ExtractedYouTubeAudio {
  audioPath: string;
  cleanup: () => Promise<void>;
}

const DIRECT_AUDIO_HOSTS = new Set([
  'p.scdn.co',
  'audio-fa.scdn.co',
  'audio-ak-spotify-com.akamaized.net',
]);

@Injectable()
export class TranscriptionAudioSourceService {
  constructor(
    private readonly audius: AudiusService,
    private readonly youtubeAudio: YouTubeAudioService,
  ) {}

  async resolve(
    provider: MusicProvider,
    providerTrackId: string,
    suppliedUrl: string,
  ): Promise<string> {
    if (provider === MusicProvider.AUDIUS) {
      return this.audius.getFreshStreamUrl(providerTrackId, suppliedUrl);
    }
    if (provider === MusicProvider.SPOTIFY) {
      const parsed = this.safeUrl(suppliedUrl);
      if (!DIRECT_AUDIO_HOSTS.has(parsed.hostname.toLowerCase())) {
        throw new BadRequestException({
          code: 'TRANSCRIPTION_AUDIO_SOURCE_UNSUPPORTED',
          message: 'Spotify transcription requires an HTTPS preview URL.',
        });
      }
      return parsed.toString();
    }
    throw new BadRequestException({
      code: 'TRANSCRIPTION_PROVIDER_UNSUPPORTED',
      message: 'This music provider does not expose a transcribable audio URL.',
    });
  }

  async extractYouTubeAudio(
    videoId: string,
    transcriptionId: string,
  ): Promise<ExtractedYouTubeAudio> {
    const directory = await mkdtemp(join(tmpdir(), 'flowfret-youtube-'));
    const audioPath = join(directory, 'source.audio');
    let extraction: ReturnType<YouTubeAudioService['createStream']> | undefined;
    try {
      extraction = this.youtubeAudio.createStream(videoId, transcriptionId);
      await pipeline(extraction.stream, createWriteStream(audioPath));
      return {
        audioPath,
        cleanup: () => rm(directory, { recursive: true, force: true }),
      };
    } catch (error) {
      extraction?.dispose();
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  private safeUrl(value: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw this.invalidUrl();
    }
    if (parsed.protocol !== 'https:') throw this.invalidUrl();
    return parsed;
  }

  private invalidUrl(): BadRequestException {
    return new BadRequestException({
      code: 'TRANSCRIPTION_AUDIO_URL_INVALID',
      message: 'The audio URL is invalid.',
    });
  }
}
