import type { LyricsOverrideService } from '../lyrics-override.service';
import { LyricsOverrideProvider } from './lyrics-override.provider';

describe('LyricsOverrideProvider', () => {
  const overrides = { find: jest.fn() };
  let provider: LyricsOverrideProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new LyricsOverrideProvider(
      overrides as unknown as LyricsOverrideService,
    );
  });

  it('returns null when provider or id are missing', async () => {
    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
    expect(overrides.find).not.toHaveBeenCalled();
  });

  it('returns null when no override exists', async () => {
    overrides.find.mockResolvedValue(null);
    await expect(
      provider.findLyrics({
        title: 'Song',
        artist: 'Artist',
        provider: 'YOUTUBE',
        id: 'abc',
      }),
    ).resolves.toBeNull();
    expect(overrides.find).toHaveBeenCalledWith('YOUTUBE', 'abc');
  });

  it('returns the override lyrics when one exists', async () => {
    overrides.find.mockResolvedValue({
      synced: true,
      plainLyrics: 'Line one\nLine two',
      lines: [
        { startTimeMs: 0, text: 'Line one' },
        { startTimeMs: 1000, text: 'Line two' },
      ],
    });
    await expect(
      provider.findLyrics({
        title: 'Song',
        artist: 'Artist',
        provider: 'YOUTUBE',
        id: 'abc',
      }),
    ).resolves.toEqual({
      provider: 'override',
      synced: true,
      instrumental: false,
      plainLyrics: 'Line one\nLine two',
      lines: [
        { startTimeMs: 0, text: 'Line one' },
        { startTimeMs: 1000, text: 'Line two' },
      ],
    });
  });
});
