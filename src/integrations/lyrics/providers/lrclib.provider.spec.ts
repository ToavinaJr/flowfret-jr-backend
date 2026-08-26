import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';
import { LrclibProvider } from './lrclib.provider';

describe('LrclibProvider', () => {
  const http = { get: jest.fn() };
  const config = { get: jest.fn() };
  let provider: LrclibProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new LrclibProvider(
      http as unknown as HttpService,
      config as unknown as ConfigService,
    );
  });

  it('normalizes synchronized lyrics', async () => {
    http.get.mockReturnValue(
      of({
        data: {
          instrumental: false,
          plainLyrics: 'Plain',
          syncedLyrics: '[00:12.40]Line',
        },
      }),
    );
    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist', duration: 120 }),
    ).resolves.toEqual({
      provider: 'lrclib',
      synced: true,
      instrumental: false,
      plainLyrics: 'Plain',
      lines: [{ startTimeMs: 12400, text: 'Line' }],
    });
  });

  it('falls back to plain lyrics and supports instrumental tracks', async () => {
    http.get.mockReturnValueOnce(
      of({ data: { syncedLyrics: null, plainLyrics: 'Plain' } }),
    );
    expect(
      await provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).toMatchObject({ synced: false, plainLyrics: 'Plain' });
    http.get.mockReturnValueOnce(
      of({
        data: { instrumental: true, syncedLyrics: null, plainLyrics: null },
      }),
    );
    expect(
      await provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).toMatchObject({ instrumental: true, synced: false });
  });

  it.each([429, 500])(
    'returns null for controlled HTTP status %s',
    async (status) => {
      http.get.mockReturnValue(
        throwError(
          () =>
            new AxiosError('failed', undefined, undefined, undefined, {
              status,
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
    },
  );

  it('tries fallbacks after 404 and rejects invalid payloads', async () => {
    const notFound = new AxiosError(
      'missing',
      undefined,
      undefined,
      undefined,
      {
        status: 404,
        statusText: '',
        headers: new AxiosHeaders(),
        config: { headers: new AxiosHeaders() },
        data: null,
      },
    );
    http.get
      .mockReturnValueOnce(throwError(() => notFound))
      .mockReturnValueOnce(of({ data: {} }));
    await expect(
      provider.findLyrics({
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        duration: 120,
      }),
    ).resolves.toBeNull();
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('handles timeout without retrying', async () => {
    http.get.mockReturnValue(
      throwError(() => new AxiosError('timeout', 'ECONNABORTED')),
    );
    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
    expect(http.get).toHaveBeenCalledTimes(1);
  });
});
