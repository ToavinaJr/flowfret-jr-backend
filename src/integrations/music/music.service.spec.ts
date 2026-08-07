import { BadRequestException } from '@nestjs/common';
import { MusicService } from './music.service';
import { AudiusService } from '../audius/audius.service';
import { GeniusService } from '../genius/genius.service';
import type { AudiusTrack } from '../audius/audius.types';

describe('MusicService', () => {
  let service: MusicService;
  let audiusService: { searchTracks: jest.Mock };
  let geniusService: { searchBestSong: jest.Mock };

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
    service = new MusicService(
      audiusService as unknown as AudiusService,
      geniusService as unknown as GeniusService,
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
    expect(result.tracks[0].streamUrl).toBe(
      'https://api.audius.co/v1/tracks/1/stream',
    );
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
