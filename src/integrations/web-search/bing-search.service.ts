import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  BING_SEARCH_API_KEY_KEY,
  BING_SEARCH_DEFAULT_ENDPOINT,
  BING_SEARCH_HTTP_TIMEOUT_MS,
} from './web-search.constants';

export interface WebSearchResult {
  url: string;
  snippet: string;
}

interface BingSearchResponse {
  webPages?: {
    value?: Array<{ url: string; snippet: string }>;
  };
}

@Injectable()
export class BingSearchService {
  private readonly logger = new Logger(BingSearchService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async search(query: string, count: number): Promise<WebSearchResult[]> {
    const apiKey = this.config.get<string>(BING_SEARCH_API_KEY_KEY)?.trim();
    if (!apiKey) return [];

    try {
      const response = await firstValueFrom(
        this.http.get<BingSearchResponse>(this.endpoint(), {
          params: { q: query, count, mkt: 'en-US', safeSearch: 'Strict' },
          headers: { 'Ocp-Apim-Subscription-Key': apiKey },
          timeout: BING_SEARCH_HTTP_TIMEOUT_MS,
        }),
      );
      return (response.data.webPages?.value ?? [])
        .filter((item) => Boolean(item.url))
        .map((item) => ({ url: item.url, snippet: item.snippet ?? '' }));
    } catch (error) {
      if (error instanceof AxiosError && error.code === 'ECONNABORTED')
        this.logger.warn('Bing search timeout');
      else
        this.logger.warn(
          `Bing search request failed (status=${error instanceof AxiosError ? (error.response?.status ?? 'network') : 'invalid'})`,
        );
      return [];
    }
  }

  private endpoint(): string {
    return (
      this.config.get<string>('BING_SEARCH_ENDPOINT')?.trim() ||
      BING_SEARCH_DEFAULT_ENDPOINT
    );
  }
}
