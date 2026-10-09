import { LyricsService } from './lyrics.service';
import type { LyricsCacheService } from './lyrics-cache.service';
import type { LrclibProvider } from './providers/lrclib.provider';
import type { GeniusLyricsProvider } from './providers/genius-lyrics.provider';
import {
  LYRICS_CACHE_TTL_SECONDS,
  LYRICS_NOT_FOUND_TTL_SECONDS,
} from './lyrics.constants';

describe('LyricsService', () => {
  const provider = { findLyrics: jest.fn() };
  const geniusProvider = { findLyrics: jest.fn() };
  const cache = { get: jest.fn(), set: jest.fn() };
  let service: LyricsService;

  beforeEach(() => {
    jest.clearAllMocks();
    geniusProvider.findLyrics.mockResolvedValue(null);
    service = new LyricsService(
      provider as unknown as LrclibProvider,
      geniusProvider as unknown as GeniusLyricsProvider,
      cache as unknown as LyricsCacheService,
    );
  });

  it('returns a cached result without calling the provider', async () => {
    const lyrics = {
      provider: 'lrclib',
      synced: false,
      instrumental: false,
      lines: [],
    };
    cache.get.mockResolvedValue(lyrics);
    await expect(
      service.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBe(lyrics);
    expect(provider.findLyrics).not.toHaveBeenCalled();
  });

  it('stores provider results and negative results with different TTLs', async () => {
    cache.get.mockResolvedValue(undefined);
    const lyrics = {
      provider: 'lrclib',
      synced: false,
      instrumental: true,
      lines: [],
    };
    provider.findLyrics
      .mockResolvedValueOnce(lyrics)
      .mockResolvedValueOnce(null);
    await expect(
      service.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBe(lyrics);
    expect(cache.set).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      lyrics,
      LYRICS_CACHE_TTL_SECONDS,
    );
    await expect(
      service.findLyrics({ title: 'Missing', artist: 'Artist' }),
    ).resolves.toBeNull();
    expect(cache.set).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      null,
      LYRICS_NOT_FOUND_TTL_SECONDS,
    );
  });
});
