import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MusicService } from './music.service';
import { AudiusService } from '../audius/audius.service';
import { GeniusService } from '../genius/genius.service';
import { SpotifyService } from '../spotify/spotify.service';
import { YouTubeService } from '../youtube/youtube.service';
import { ConfigService } from '@nestjs/config';
import type { AudiusTrack } from '../audius/audius.types';
import { MusicEnrichmentService } from './music-enrichment.service';

describe('MusicService', () => {
  let service: MusicService;
  let audiusService: { searchTracks: jest.Mock };
  let geniusService: { searchBestSong: jest.Mock };
  let spotifyService: { searchTracks: jest.Mock };
  let youtubeService: { searchMusic: jest.Mock };
  let configService: { get: jest.Mock };

  const track = (id: string, name: string): AudiusTrack => ({
    id,
    title: name,
    duration: 120,
    genre: 'Rock',
    permalink: `/artist/${id}`,
    user: { id: `artist-${id}`, name: 'Artist' },
    artwork: { _480x480: 'https://img.test/cover.jpg' },
    stream: { url: `https://audio.test/${id}.mp3` },
  });

  beforeEach(() => {
    audiusService = { searchTracks: jest.fn() };
    geniusService = { searchBestSong: jest.fn() };
    spotifyService = { searchTracks: jest.fn() };
    youtubeService = { searchMusic: jest.fn() };
    configService = { get: jest.fn() };
    service = new MusicService(
      audiusService as unknown as AudiusService,
      spotifyService as unknown as SpotifyService,
      youtubeService as unknown as YouTubeService,
      new MusicEnrichmentService(geniusService as unknown as GeniusService),
      configService as unknown as ConfigService,
    );
  });

  it('rejects empty query', async () => {
    await expect(service.searchMusic('   ', 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('keeps Audius results when Genius fails', async () => {
    audiusService.searchTracks.mockResolvedValue({
      tracks: [track('1', 'One'), track('2', 'Two')],
      total: 2,
    });
    geniusService.searchBestSong
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({
        url: 'https://genius.com/two',
        matchScore: 0.9,
      });

    const result = await service.searchMusic('query', 10);

    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0].geniusUrl).toBeNull();
    expect(result.tracks[1].geniusUrl).toBe('https://genius.com/two');
    expect(result.tracks.map((item) => item.audiusId)).toEqual(['1', '2']);
    expect(result.tracks.map((item) => item.providerTrackId)).toEqual([
      '1',
      '2',
    ]);
    expect(result.tracks[0].streamUrl).toBe(
      'https://api.audius.co/v1/tracks/1/stream',
    );
    expect(result.provider).toBe('AUDIUS');
  });

  it('selects YouTube from MUSIC_PROVIDER case-insensitively', async () => {
    configService.get.mockReturnValue(' youtube ');
    youtubeService.searchMusic.mockResolvedValue({
      videos: [
        {
          id: 'video',
          title: 'Song',
          channelId: 'channel',
          channelTitle: 'Artist',
          thumbnailUrl: null,
          durationMs: 1000,
        },
      ],
      total: 1,
    });
    geniusService.searchBestSong.mockResolvedValue(null);

    const result = await service.searchMusic('query', 10);

    expect(youtubeService.searchMusic).toHaveBeenCalledWith('query', 10);
    expect(audiusService.searchTracks).not.toHaveBeenCalled();
    expect(result.provider).toBe('YOUTUBE');
    expect(result.tracks[0].provider).toBe('YOUTUBE');
  });

  it('falls back to Audius for an unsupported provider', async () => {
    configService.get.mockReturnValue('unknown');
    audiusService.searchTracks.mockResolvedValue({ tracks: [], total: 0 });

    const result = await service.searchMusic('query', 10);

    expect(audiusService.searchTracks).toHaveBeenCalledWith('query', 10);
    expect(result.provider).toBe('AUDIUS');
  });

  it('falls back to Audius when Spotify refuses API access', async () => {
    configService.get.mockReturnValue('SPOTIFY');
    spotifyService.searchTracks.mockRejectedValue(
      new ForbiddenException({ code: 'SPOTIFY_ACCESS_FORBIDDEN' }),
    );
    audiusService.searchTracks.mockResolvedValue({
      tracks: [track('fallback', 'Fallback song')],
      total: 1,
    });
    geniusService.searchBestSong.mockResolvedValue(null);

    const result = await service.searchMusic('query', 10);

    expect(spotifyService.searchTracks).toHaveBeenCalledWith('query', 10);
    expect(audiusService.searchTracks).toHaveBeenCalledWith('query', 10);
    expect(result.provider).toBe('AUDIUS');
    expect(result.tracks[0]).toMatchObject({
      provider: 'AUDIUS',
      audiusId: 'fallback',
    });
  });

  it('preserves Audius order and deduplicates', async () => {
    audiusService.searchTracks.mockResolvedValue({
      tracks: [track('1', 'One'), track('1', 'One'), track('2', 'Two')],
      total: 3,
    });
    geniusService.searchBestSong.mockResolvedValue(null);

    const result = await service.searchMusic('query', 10);
    expect(result.tracks.map((item) => item.audiusId)).toEqual(['1', '2']);
    expect(result.total).toBe(3);
  });
});
