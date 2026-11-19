import { BadRequestException } from '@nestjs/common';
import { MusicProvider } from '@prisma/client';
import type { AudiusService } from '../integrations/audius/audius.service';
import type { SpotifyService } from '../integrations/spotify/spotify.service';
import { TranscriptionAudioSourceService } from './transcription-audio-source.service';

describe('TranscriptionAudioSourceService', () => {
  const audius = { getFreshStreamUrl: jest.fn() };
  const spotify = { getTrack: jest.fn() };
  const youtubeAudio = { createStream: jest.fn() };
  const service = new TranscriptionAudioSourceService(
    audius as unknown as AudiusService,
    spotify as unknown as SpotifyService,
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

  it('uses the preview URL loaded from Spotify by the requested track ID', async () => {
    spotify.getTrack.mockResolvedValue({
      id: 'track-1',
      preview_url: 'https://p.scdn.co/mp3-preview/track-1.mp3',
    });

    await expect(
      service.resolve(
        MusicProvider.SPOTIFY,
        'track-1',
        'https://p.scdn.co/mp3-preview/another-track.mp3',
      ),
    ).resolves.toBe('https://p.scdn.co/mp3-preview/track-1.mp3');
    expect(spotify.getTrack).toHaveBeenCalledWith('track-1');
  });

  it('rejects a Spotify track ID that does not match the fetched track', async () => {
    spotify.getTrack.mockResolvedValue({
      id: 'track-b',
      preview_url: 'https://p.scdn.co/mp3-preview/track-b.mp3',
    });

    await expect(
      service.resolve(
        MusicProvider.SPOTIFY,
        'track-a',
        'https://p.scdn.co/mp3-preview/track-a.mp3',
      ),
    ).rejects.toMatchObject({
      response: { code: 'TRANSCRIPTION_TRACK_MISMATCH' },
    });
  });

  it('rejects Spotify tracks without an available preview', async () => {
    spotify.getTrack.mockResolvedValue({ id: 'track-1', preview_url: null });

    await expect(
      service.resolve(
        MusicProvider.SPOTIFY,
        'track-1',
        'https://p.scdn.co/mp3-preview/unrelated.mp3',
      ),
    ).rejects.toMatchObject({
      response: { code: 'TRANSCRIPTION_AUDIO_SOURCE_UNAVAILABLE' },
    });
  });

  it('rejects non-Spotify preview URLs even if a preview is returned', async () => {
    spotify.getTrack.mockResolvedValue({
      id: 'track-1',
      preview_url: 'https://attacker.example/file.mp3',
    });

    await expect(
      service.resolve(
        MusicProvider.SPOTIFY,
        'track-1',
        'https://p.scdn.co/mp3-preview/file.mp3',
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
