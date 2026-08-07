import { BadRequestException } from '@nestjs/common';
import { MusicService } from './music.service';
import { YouTubeService } from '../youtube/youtube.service';
import { GeniusService } from '../genius/genius.service';
import type { YouTubeVideo } from '../youtube/youtube.types';

describe('MusicService', () => {
  let service: MusicService;
  let youtubeService: { searchMusic: jest.Mock };
  let geniusService: { searchBestSong: jest.Mock };

  const track = (id: string, name: string): YouTubeVideo => ({
    id,
    title: name,
    durationMs: 120000,
    channelId: `channel-${id}`,
    channelTitle: 'Artist',
    thumbnailUrl: 'https://img.test/cover.jpg',
  });

  beforeEach(() => {
    youtubeService = { searchMusic: jest.fn() };
    geniusService = { searchBestSong: jest.fn() };
    service = new MusicService(
      youtubeService as unknown as YouTubeService,
      geniusService as unknown as GeniusService,
    );
  });

  it('rejects empty query', async () => {
    await expect(service.searchMusic('   ', 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('keeps YouTube results when Genius fails', async () => {
    youtubeService.searchMusic.mockResolvedValue({
      videos: [track('1', 'One'), track('2', 'Two')],
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
    expect(result.tracks.map((item) => item.youtubeId)).toEqual(['1', '2']);
  });

  it('preserves YouTube order and deduplicates', async () => {
    youtubeService.searchMusic.mockResolvedValue({
      videos: [track('1', 'One'), track('1', 'One'), track('2', 'Two')],
      total: 3,
    });
    geniusService.searchBestSong.mockResolvedValue(null);

    const result = await service.searchMusic('query', 10);
    expect(result.tracks.map((item) => item.youtubeId)).toEqual(['1', '2']);
    expect(result.total).toBe(3);
  });
});
