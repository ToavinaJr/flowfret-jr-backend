import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import {
  HttpException,
  HttpStatus,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosError, AxiosHeaders } from 'axios';
import { SpotifyService } from './spotify.service';

describe('SpotifyService', () => {
  let service: SpotifyService;
  let httpService: { post: jest.Mock; get: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    httpService = {
      post: jest.fn(),
      get: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'SPOTIFY_CLIENT_ID') return 'client-id';
        if (key === 'SPOTIFY_CLIENT_SECRET') return 'client-secret';
        return undefined;
      }),
    };
    service = new SpotifyService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  function mockToken(expiresIn = 3600) {
    httpService.post.mockReturnValueOnce(
      of({
        data: {
          access_token: 'token-1',
          token_type: 'Bearer',
          expires_in: expiresIn,
        },
      }),
    );
  }

  it('fetches and caches access token', async () => {
    mockToken();
    httpService.get.mockReturnValue(
      of({
        data: {
          tracks: {
            total: 1,
            items: [
              {
                id: 't1',
                name: 'Song',
                duration_ms: 1000,
                preview_url: null,
                external_urls: { spotify: 'https://open.spotify.com/track/t1' },
                artists: [{ id: 'a1', name: 'Artist' }],
                album: { id: 'al1', name: 'Album', images: [] },
              },
            ],
          },
        },
      }),
    );

    await service.searchTracks('query', 5);
    await service.searchTracks('query', 5);

    expect(httpService.post).toHaveBeenCalledTimes(1);
    expect(httpService.get).toHaveBeenCalledTimes(2);
  });

  it('refreshes expired token', async () => {
    mockToken(0);
    httpService.get.mockReturnValue(
      of({
        data: { tracks: { total: 0, items: [] } },
      }),
    );

    await service.searchTracks('q', 1);
    mockToken(3600);
    await service.searchTracks('q', 1);

    expect(httpService.post).toHaveBeenCalledTimes(2);
  });

  it('retries search after 401', async () => {
    mockToken();
    const unauthorized = new AxiosError('Unauthorized');
    unauthorized.response = {
      status: 401,
      data: {},
      statusText: 'Unauthorized',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
    httpService.get
      .mockReturnValueOnce(throwError(() => unauthorized))
      .mockReturnValueOnce(of({ data: { tracks: { total: 0, items: [] } } }));
    mockToken();

    await expect(service.searchTracks('q', 1)).resolves.toEqual({
      tracks: [],
      total: 0,
    });
    expect(httpService.post).toHaveBeenCalledTimes(2);
  });

  it('maps 429 to TooManyRequestsException', async () => {
    mockToken();
    const rateLimited = new AxiosError('Too Many Requests');
    rateLimited.response = {
      status: 429,
      data: {},
      statusText: 'Too Many Requests',
      headers: { 'retry-after': '2' },
      config: { headers: new AxiosHeaders() },
    };
    httpService.get.mockReturnValue(throwError(() => rateLimited));

    try {
      await service.searchTracks('q', 1);
      fail('expected rate limit error');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });

  it('maps a forbidden development-mode app to a stable 403 error', async () => {
    mockToken();
    const forbidden = new AxiosError('Forbidden');
    forbidden.response = {
      status: 403,
      data: { error: { message: 'Access denied' } },
      statusText: 'Forbidden',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
    httpService.get.mockReturnValue(throwError(() => forbidden));

    await expect(service.searchTracks('q', 1)).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: {
        code: 'SPOTIFY_ACCESS_FORBIDDEN',
        message: 'Spotify search is unavailable for this application',
      },
    });
  });

  it('clamps limit between 1 and 10', async () => {
    mockToken();
    httpService.get.mockReturnValue(
      of({ data: { tracks: { total: 0, items: [] } } }),
    );

    await service.searchTracks('q', 99);
    const [, requestConfig] = httpService.get.mock.calls[0] as [
      string,
      { params: { limit: number } },
    ];
    expect(requestConfig.params.limit).toBe(10);
  });

  it('throws UnauthorizedException on token 401', async () => {
    const unauthorized = new AxiosError('Unauthorized');
    unauthorized.response = {
      status: 401,
      data: {},
      statusText: 'Unauthorized',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
    httpService.post.mockReturnValue(throwError(() => unauthorized));

    await expect(service.searchTracks('q', 1)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
