import { LyricsService } from './lyrics.service';
import type { LyricsCacheService } from './lyrics-cache.service';
import type { LrclibProvider } from './providers/lrclib.provider';
import type { GeniusLyricsProvider } from './providers/genius-lyrics.provider';
import type { LlmWebSearchLyricsProvider } from './providers/llm-web-search-lyrics.provider';
import type { LyricsOverrideProvider } from './providers/lyrics-override.provider';
import type { TononkiraLyricsProvider } from './providers/tononkira-lyrics.provider';
import {
  LYRICS_CACHE_TTL_SECONDS,
  LYRICS_NOT_FOUND_TTL_SECONDS,
} from './lyrics.constants';

describe('LyricsService', () => {
  const overrideProvider = { findLyrics: jest.fn() };
  const provider = { findLyrics: jest.fn() };
  const geniusProvider = { findLyrics: jest.fn() };
  const tononkiraProvider = { findLyrics: jest.fn() };
  const llmWebSearchProvider = { findLyrics: jest.fn() };
  const cache = { get: jest.fn(), set: jest.fn() };
  let service: LyricsService;

  beforeEach(() => {
    jest.clearAllMocks();
    overrideProvider.findLyrics.mockResolvedValue(null);
    geniusProvider.findLyrics.mockResolvedValue(null);
    tononkiraProvider.findLyrics.mockResolvedValue(null);
    llmWebSearchProvider.findLyrics.mockResolvedValue(null);
    service = new LyricsService(
      overrideProvider as unknown as LyricsOverrideProvider,
      provider as unknown as LrclibProvider,
      geniusProvider as unknown as GeniusLyricsProvider,
      tononkiraProvider as unknown as TononkiraLyricsProvider,
      llmWebSearchProvider as unknown as LlmWebSearchLyricsProvider,
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

  it('returns an override immediately, without consulting the cache', async () => {
    const override = {
      provider: 'override',
      synced: false,
      instrumental: false,
      plainLyrics: 'Line one',
      lines: [{ startTimeMs: null, text: 'Line one' }],
    };
    overrideProvider.findLyrics.mockResolvedValue(override);
    await expect(
      service.findLyrics({
        provider: 'YOUTUBE',
        id: 'abc',
        title: 'Song',
        artist: 'Artist',
      }),
    ).resolves.toBe(override);
    expect(cache.get).not.toHaveBeenCalled();
    expect(provider.findLyrics).not.toHaveBeenCalled();
  });
});
