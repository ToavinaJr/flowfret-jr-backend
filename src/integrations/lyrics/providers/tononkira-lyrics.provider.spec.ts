import { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';
import {
  isPublicInternetAddress,
  TononkiraLyricsProvider,
} from './tononkira-lyrics.provider';

describe('TononkiraLyricsProvider', () => {
  const http = { get: jest.fn() };
  let provider: TononkiraLyricsProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new TononkiraLyricsProvider(http as unknown as HttpService);
    jest
      .spyOn(
        provider as unknown as {
          resolvePublicAddress: () => Promise<{
            address: string;
            family: number;
          }>;
        },
        'resolvePublicAddress',
      )
      .mockResolvedValue({ address: '1.1.1.1', family: 4 });
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

  it('removes source-domain mentions and standalone refrain/bridge headings', async () => {
    http.get.mockReturnValue(
      of({
        data: `<html><body>
          <div class="print my-3 fst-italic">(Nalaina tao amin'ny tononkira.serasera.org)</div>
          <div id="random1234">
            First line from tononkira.serasera.org<br>
            [Refrain]<br>
            Actual chorus line<br>
            BRIDGE:<br>
            Last line
          </div>
        </body></html>`,
      }),
    );

    await expect(
      provider.fetchFromUrl(
        'https://tononkira.serasera.org/hira/dadazily/ny-ainga',
      ),
    ).resolves.toEqual(['First line', 'Actual chorus line', 'Last line']);
  });

  it('stays unsynced even when a duration is known', async () => {
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
    expect(result?.synced).toBe(false);
    expect(result?.lines[0]).toEqual({
      startTimeMs: null,
      text: 'First line',
    });
    expect(result?.lines[1]).toEqual({
      startTimeMs: null,
      text: 'Second line',
    });
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

  describe('fetchFromUrl', () => {
    it('fetches and extracts lines from an admin-supplied Tononkira URL', async () => {
      http.get.mockReturnValue(
        of({
          data: `<html><body>
            <div class="print my-3 fst-italic">(byline)</div>
            <div id="random1234">First line<br>Second line<br></div>
          </body></html>`,
        }),
      );
      await expect(
        provider.fetchFromUrl(
          'https://tononkira.serasera.org/hira/dadazily/ny-ainga',
        ),
      ).resolves.toEqual(['First line', 'Second line']);
      expect(http.get).toHaveBeenCalledWith(
        'https://tononkira.serasera.org/hira/dadazily/ny-ainga',
        expect.any(Object),
      );
    });

    it('rejects URLs outside the tononkira.serasera.org domain', async () => {
      await expect(
        provider.fetchFromUrl('https://evil.example.com/hira/x/y'),
      ).resolves.toBeNull();
      expect(http.get).not.toHaveBeenCalled();
    });

    it.each([
      'http://tononkira.serasera.org/hira/a/b',
      'https://sub.tononkira.serasera.org/hira/a/b',
      'https://user:password@tononkira.serasera.org/hira/a/b',
      'https://tononkira.serasera.org:8443/hira/a/b',
      'https://tononkira.serasera.org/not-hira/a/b',
    ])('rejects unsafe Tononkira URL %s', async (url) => {
      await expect(provider.fetchFromUrl(url)).resolves.toBeNull();
      expect(http.get).not.toHaveBeenCalled();
    });

    it('disables redirects and caps the downloaded page size', async () => {
      http.get.mockReturnValue(
        of({ data: '<html><body>Not found</body></html>' }),
      );
      await provider.fetchFromUrl(
        'https://tononkira.serasera.org/hira/dadazily/ny-ainga',
      );
      expect(http.get).toHaveBeenCalledWith(
        'https://tononkira.serasera.org/hira/dadazily/ny-ainga',
        expect.objectContaining({
          maxRedirects: 0,
          maxContentLength: 1_000_000,
          maxBodyLength: 1_000_000,
        }),
      );
    });

    it('rejects malformed URLs', async () => {
      await expect(provider.fetchFromUrl('not a url')).resolves.toBeNull();
      expect(http.get).not.toHaveBeenCalled();
    });

    it('returns null when the page has no lyrics container', async () => {
      http.get.mockReturnValue(
        of({ data: '<html><body>Not found</body></html>' }),
      );
      await expect(
        provider.fetchFromUrl(
          'https://tononkira.serasera.org/hira/dadazily/ny-ainga',
        ),
      ).resolves.toBeNull();
    });
  });
});

describe('isPublicInternetAddress', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.2',
    '169.254.169.254',
    '192.168.1.4',
    '::1',
    'fc00::1',
    'fe80::1',
  ])('rejects non-public address %s', (address) =>
    expect(isPublicInternetAddress(address)).toBe(false),
  );

  it.each(['1.1.1.1', '2606:4700:4700::1111'])(
    'allows public address %s',
    (address) => expect(isPublicInternetAddress(address)).toBe(true),
  );
});
