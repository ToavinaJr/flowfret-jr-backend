import { BadRequestException, Injectable } from '@nestjs/common';
import { MusicProvider } from '@prisma/client';
import { AudiusService } from '../integrations/audius/audius.service';

const DIRECT_AUDIO_HOSTS = new Set([
  'p.scdn.co',
  'audio-fa.scdn.co',
  'audio-ak-spotify-com.akamaized.net',
]);

@Injectable()
export class TranscriptionAudioSourceService {
  constructor(private readonly audius: AudiusService) {}

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
