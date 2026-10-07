import { BadRequestException, Injectable } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { MusicProvider } from '@prisma/client';
import { AudiusService } from '../integrations/audius/audius.service';
import { YouTubeAudioService } from '../integrations/youtube/youtube-audio.service';
import { STEMS_ERROR_CODE } from './stems.constants';

export interface ExtractedAudio {
  audioPath: string;
  cleanup: () => Promise<void>;
}

@Injectable()
export class StemsAudioSourceService {
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
    throw new BadRequestException({
      code: STEMS_ERROR_CODE.PROVIDER_UNSUPPORTED,
      message: 'This music provider does not support vocal separation yet.',
    });
  }

  async extractYouTubeAudio(
    videoId: string,
    audioStemId: string,
  ): Promise<ExtractedAudio> {
    const directory = await mkdtemp(join(tmpdir(), 'flowfret-stems-youtube-'));
    const audioPath = join(directory, 'source.audio');
    let extraction: ReturnType<YouTubeAudioService['createStream']> | undefined;
    try {
      extraction = this.youtubeAudio.createStream(videoId, audioStemId);
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
}
