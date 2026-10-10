import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import { BingSearchService } from './bing-search.service';

describe('BingSearchService', () => {
  const http = { get: jest.fn() };
  const config = { get: jest.fn() };
  let service: BingSearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BingSearchService(
      http as unknown as HttpService,
      config as unknown as ConfigService,
    );
  });

  it('returns an empty array when no API key is configured', async () => {
    config.get.mockReturnValue(undefined);
    await expect(service.search('query', 3)).resolves.toEqual([]);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('returns web page results when an API key is configured', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'BING_SEARCH_API_KEY' ? 'test-key' : undefined,
    );
    http.get.mockReturnValue(
      of({
        data: {
          webPages: {
            value: [
              { url: 'https://example.com/a', snippet: 'Snippet A' },
              { url: 'https://example.com/b', snippet: '' },
            ],
          },
        },
      }),
    );
    await expect(service.search('query', 3)).resolves.toEqual([
      { url: 'https://example.com/a', snippet: 'Snippet A' },
      { url: 'https://example.com/b', snippet: '' },
    ]);
  });

  it('returns an empty array when the request fails', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'BING_SEARCH_API_KEY' ? 'test-key' : undefined,
    );
    http.get.mockReturnValue(
      throwError(() => new AxiosError('timeout', 'ECONNABORTED')),
    );
    await expect(service.search('query', 3)).resolves.toEqual([]);
  });
});
