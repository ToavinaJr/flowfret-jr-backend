import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosError, AxiosHeaders } from 'axios';
import { GeniusService } from './genius.service';

describe('GeniusService', () => {
  let service: GeniusService;
  let httpService: { get: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    httpService = { get: jest.fn() };
    configService = {
      get: jest.fn((key: string) =>
        key === 'GENIUS_ACCESS_TOKEN' ? 'genius-token' : undefined,
      ),
    };
    service = new GeniusService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  it('returns a relevant match', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          response: {
            hits: [
              {
                type: 'song',
                result: {
                  id: 1,
                  title: 'Bohemian Rhapsody',
                  full_title: 'Bohemian Rhapsody by Queen',
                  url: 'https://genius.com/queen-bohemian-rhapsody-lyrics',
                  primary_artist: { name: 'Queen' },
                  song_art_image_thumbnail_url: null,
                },
              },
            ],
          },
        },
      }),
    );

    const match = await service.searchBestSong('Bohemian Rhapsody', 'Queen');
    expect(match?.url).toContain('genius.com');
    expect(match?.matchScore).toBeGreaterThan(0.55);
  });

  it('returns null when no relevant match', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          response: {
            hits: [
              {
                type: 'song',
                result: {
                  id: 2,
                  title: 'Totally Different Song',
                  full_title: 'Totally Different Song by Other',
                  url: 'https://genius.com/other',
                  primary_artist: { name: 'Other Artist' },
                  song_art_image_thumbnail_url: null,
                },
              },
            ],
          },
        },
      }),
    );

    await expect(
      service.searchBestSong('Bohemian Rhapsody', 'Queen'),
    ).resolves.toBeNull();
  });

  it('returns null when Genius has no hits', async () => {
    httpService.get.mockReturnValue(of({ data: { response: { hits: [] } } }));

    await expect(service.searchBestSong('Song', 'Artist')).resolves.toBeNull();
  });

  it('caches repeated lookups including null', async () => {
    httpService.get.mockReturnValue(of({ data: { response: { hits: [] } } }));

    await service.searchBestSong('Song', 'Artist');
    await service.searchBestSong('Song', 'Artist');

    expect(httpService.get).toHaveBeenCalledTimes(1);
  });

  it('treats Genius errors as optional null', async () => {
    const unauthorized = new AxiosError('Unauthorized');
    unauthorized.response = {
      status: 401,
      data: {},
      statusText: 'Unauthorized',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
    httpService.get.mockReturnValue(throwError(() => unauthorized));

    await expect(service.searchBestSong('Song', 'Artist')).resolves.toBeNull();
  });

  it('normalizes noisy titles', () => {
    expect(
      service.normalizeText('Song Name (Official Video) - Remastered'),
    ).toBe('song name');
  });
});
