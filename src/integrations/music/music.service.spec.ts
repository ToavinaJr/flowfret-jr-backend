import { BadRequestException } from '@nestjs/common';
import { MusicService } from './music.service';
import { SpotifyService } from '../spotify/spotify.service';
import { GeniusService } from '../genius/genius.service';
import type { SpotifyTrack } from '../spotify/spotify.types';

describe('MusicService', () => {
  let service: MusicService;
  let spotifyService: { searchTracks: jest.Mock };
  let geniusService: { searchBestSong: jest.Mock };

  const track = (id: string, name: string): SpotifyTrack => ({
    id,
    name,
    duration_ms: 120000,
    preview_url: null,
    external_urls: { spotify: `https://open.spotify.com/track/${id}` },
    artists: [{ id: `a-${id}`, name: 'Artist' }],
    album: {
      id: `al-${id}`,
      name: 'Album',
      images: [{ url: 'https://img.test/cover.jpg', height: 300, width: 300 }],
    },
  });

  beforeEach(() => {
    spotifyService = { searchTracks: jest.fn() };
    geniusService = { searchBestSong: jest.fn() };
    service = new MusicService(
      spotifyService as unknown as SpotifyService,
      geniusService as unknown as GeniusService,
    );
  });

  it('rejects empty query', async () => {
    await expect(service.searchMusic('   ', 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('keeps Spotify results when Genius fails', async () => {
    spotifyService.searchTracks.mockResolvedValue({
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
    expect(result.tracks.map((item) => item.spotifyId)).toEqual(['1', '2']);
  });

  it('preserves Spotify order and deduplicates', async () => {
    spotifyService.searchTracks.mockResolvedValue({
      tracks: [track('1', 'One'), track('1', 'One'), track('2', 'Two')],
      total: 3,
    });
    geniusService.searchBestSong.mockResolvedValue(null);

    const result = await service.searchMusic('query', 10);
    expect(result.tracks.map((item) => item.spotifyId)).toEqual(['1', '2']);
    expect(result.total).toBe(3);
  });
});
