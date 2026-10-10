import { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';
import { TononkiraLyricsProvider } from './tononkira-lyrics.provider';

describe('TononkiraLyricsProvider', () => {
  const http = { get: jest.fn() };
  let provider: TononkiraLyricsProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new TononkiraLyricsProvider(http as unknown as HttpService);
  });

  it('requests a URL built from slugified artist/title', async () => {
    http.get.mockReturnValue(
      of({ data: '<html><body>No lyrics container here</body></html>' }),
    );
    await provider.findLyrics({ title: 'Aoka', artist: 'Tsota Rô' });
    expect(http.get).toHaveBeenCalledWith(
      'https://tononkira.serasera.org/hira/tsota-ro/aoka',
      expect.any(Object),
    );
  });

  it('trims surrounding whitespace and collapses internal spaces to a single dash', async () => {
    http.get.mockReturnValue(
      of({ data: '<html><body>No lyrics container here</body></html>' }),
    );
    await provider.findLyrics({
      title: '  Aoka   Fa   Tsara  ',
      artist: '   Tsota   Rakoto   ',
    });
    expect(http.get).toHaveBeenCalledWith(
      'https://tononkira.serasera.org/hira/tsota-rakoto/aoka-fa-tsara',
      expect.any(Object),
    );
  });

  it('extracts lines and strips honeypot spans', async () => {
    http.get.mockReturnValue(
      of({
        data: `<html><body>
          <div class="print my-3 fst-italic">(byline)</div>
          <div id="random1234">
            First line<span aria-hidden="true">junk</span><br>
            Second line<br>
          </div>
        </body></html>`,
      }),
    );
    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toEqual({
      provider: 'tononkira',
      synced: false,
      instrumental: false,
      plainLyrics: 'First line\nSecond line',
      lines: [
        { startTimeMs: null, text: 'First line' },
        { startTimeMs: null, text: 'Second line' },
      ],
    });
  });

  it('estimates per-line timing and marks the result synced when a duration is known', async () => {
    http.get.mockReturnValue(
      of({
        data: `<html><body>
          <div class="print my-3 fst-italic">(byline)</div>
          <div id="random1234">
            First line<br>
            Second line<br>
          </div>
        </body></html>`,
      }),
    );
    const result = await provider.findLyrics({
      title: 'Song',
      artist: 'Artist',
      duration: 60,
    });
    expect(result?.synced).toBe(true);
    expect(result?.lines[0]).toEqual({ startTimeMs: 0, text: 'First line' });
    expect(result?.lines[1].text).toBe('Second line');
    expect(result?.lines[1].startTimeMs).toBeGreaterThan(0);
    expect(result?.lines[1].startTimeMs).toBeLessThan(60_000);
  });

  it('returns null when the page has no lyrics container', async () => {
    http.get.mockReturnValue(
      of({ data: '<html><body>Not found</body></html>' }),
    );
    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
  });

  it('returns null on a 404 (track not on Tononkira)', async () => {
    http.get.mockReturnValue(
      throwError(
        () =>
          new AxiosError('not found', undefined, undefined, undefined, {
            status: 404,
            statusText: '',
            headers: new AxiosHeaders(),
            config: { headers: new AxiosHeaders() },
            data: null,
          }),
      ),
    );
    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
  });

  it('returns null when the artist or title cannot be slugified', async () => {
    await expect(
      provider.findLyrics({ title: '!!!', artist: '???' }),
    ).resolves.toBeNull();
    expect(http.get).not.toHaveBeenCalled();
  });
});
