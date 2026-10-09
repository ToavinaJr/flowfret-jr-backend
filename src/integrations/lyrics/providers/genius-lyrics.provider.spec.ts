import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import type { GeniusService } from '../../genius/genius.service';
import { GeniusLyricsProvider } from './genius-lyrics.provider';

describe('GeniusLyricsProvider', () => {
  const genius = { searchBestSong: jest.fn() };
  const http = { get: jest.fn() };
  let provider: GeniusLyricsProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new GeniusLyricsProvider(
      genius as unknown as GeniusService,
      http as unknown as HttpService,
    );
  });

  it('returns null when Genius has no match', async () => {
    genius.searchBestSong.mockResolvedValue(null);
    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
    expect(http.get).not.toHaveBeenCalled();
  });

  it('scrapes lyrics lines out of the Genius lyrics containers', async () => {
    genius.searchBestSong.mockResolvedValue({
      id: 1,
      title: 'Song',
      fullTitle: 'Song by Artist',
      url: 'https://genius.com/artist-song-lyrics',
      primaryArtistName: 'Artist',
      thumbnailUrl: null,
      matchScore: 0.9,
    });
    http.get.mockReturnValue(
      of({
        data: `<html><body>
          <div data-lyrics-container="true">[Chorus]<br>Hello world<br>It is me</div>
          <div data-lyrics-container="true">Second verse<br></div>
        </body></html>`,
      }),
    );
    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toEqual({
      provider: 'genius',
      synced: false,
      instrumental: false,
      plainLyrics: '[Chorus]\nHello world\nIt is me\nSecond verse',
      lines: [
        { startTimeMs: null, text: '[Chorus]' },
        { startTimeMs: null, text: 'Hello world' },
        { startTimeMs: null, text: 'It is me' },
        { startTimeMs: null, text: 'Second verse' },
      ],
    });
  });

  it('returns null when the page has no lyrics containers', async () => {
    genius.searchBestSong.mockResolvedValue({
      id: 1,
      title: 'Song',
      fullTitle: 'Song by Artist',
      url: 'https://genius.com/artist-song-lyrics',
      primaryArtistName: 'Artist',
      thumbnailUrl: null,
      matchScore: 0.9,
    });
    http.get.mockReturnValue(of({ data: '<html><body>Not found</body></html>' }));
    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
  });

  it('returns null when the Genius page request fails', async () => {
    genius.searchBestSong.mockResolvedValue({
      id: 1,
      title: 'Song',
      fullTitle: 'Song by Artist',
      url: 'https://genius.com/artist-song-lyrics',
      primaryArtistName: 'Artist',
      thumbnailUrl: null,
      matchScore: 0.9,
    });
    http.get.mockReturnValue(
      throwError(() => new AxiosError('timeout', 'ECONNABORTED')),
    );
    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
  });
});
