import { BadRequestException } from '@nestjs/common';
import { MusicProvider } from '@prisma/client';
import type { AudiusService } from '../integrations/audius/audius.service';
import { TranscriptionAudioSourceService } from './transcription-audio-source.service';

describe('TranscriptionAudioSourceService', () => {
  const audius = { getFreshStreamUrl: jest.fn() };
  const youtubeAudio = { createStream: jest.fn() };
  const service = new TranscriptionAudioSourceService(
    audius as unknown as AudiusService,
    youtubeAudio as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('refreshes Audius URLs server-side', async () => {
    audius.getFreshStreamUrl.mockResolvedValue('https://audio.audius.co/fresh');

    await expect(
      service.resolve(MusicProvider.AUDIUS, 'track-1', 'https://old.example'),
    ).resolves.toBe('https://audio.audius.co/fresh');
    expect(audius.getFreshStreamUrl).toHaveBeenCalledWith(
      'track-1',
      'https://old.example',
    );
  });

  it('accepts only allowlisted HTTPS Spotify preview hosts', async () => {
    await expect(
      service.resolve(
        MusicProvider.SPOTIFY,
        'track-1',
        'https://p.scdn.co/mp3-preview/file.mp3',
      ),
    ).resolves.toBe('https://p.scdn.co/mp3-preview/file.mp3');

    await expect(
      service.resolve(
        MusicProvider.SPOTIFY,
        'track-1',
        'https://attacker.example/file.mp3',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unsupported providers with a stable client error', async () => {
    await expect(
      service.resolve(MusicProvider.YOUTUBE, 'video-1', 'https://youtube.com'),
    ).rejects.toMatchObject({
      response: { code: 'TRANSCRIPTION_PROVIDER_UNSUPPORTED' },
    });
  });
});
