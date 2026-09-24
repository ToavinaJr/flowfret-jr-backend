import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { getRequiredConfig } from '../../common/required-config';
import {
  YOUTUBE_API_KEY_KEY,
  YOUTUBE_API_URL,
  YOUTUBE_HTTP_TIMEOUT_MS,
  YOUTUBE_MUSIC_TOPIC_ID,
  YOUTUBE_SEARCH_MAX_LIMIT,
  YOUTUBE_SEARCH_MIN_LIMIT,
  YOUTUBE_SEARCH_PATH,
  YOUTUBE_VIDEOS_PATH,
} from './youtube.constants';
import type {
  YouTubeSearchResponse,
  YouTubeSearchResult,
  YouTubeVideosResponse,
} from './youtube.types';
import {
  decodeYouTubeHtml,
  parseYouTubeDuration,
  pickYouTubeThumbnail,
  readYouTubeErrorReason,
} from './youtube.utils';

@Injectable()
export class YouTubeService {
  private readonly logger = new Logger(YouTubeService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async searchMusic(
    query: string,
    limit: number,
    pageToken?: string,
  ): Promise<YouTubeSearchResult> {
    const apiKey = getRequiredConfig(this.configService, YOUTUBE_API_KEY_KEY);
    const maxResults = Math.min(
      YOUTUBE_SEARCH_MAX_LIMIT,
      Math.max(YOUTUBE_SEARCH_MIN_LIMIT, Math.trunc(limit)),
    );

    try {
      const searchResponse = await firstValueFrom(
        this.httpService.get<YouTubeSearchResponse>(
          `${YOUTUBE_API_URL}${YOUTUBE_SEARCH_PATH}`,
          {
            params: {
              key: apiKey,
              part: 'snippet',
              q: query,
              type: 'video',
              topicId: YOUTUBE_MUSIC_TOPIC_ID,
              videoEmbeddable: 'true',
              maxResults,
              ...(pageToken ? { pageToken } : {}),
            },
            timeout: YOUTUBE_HTTP_TIMEOUT_MS,
          },
        ),
      );

      const items = (searchResponse.data.items ?? []).filter(
        (item) => typeof item.id.videoId === 'string',
      );
      const ids = items.map((item) => item.id.videoId as string);
      const durations = await this.fetchDurations(ids, apiKey);

      return {
        videos: items.map((item) => ({
          id: item.id.videoId as string,
          title: decodeYouTubeHtml(item.snippet.title),
          channelId: item.snippet.channelId,
          channelTitle: decodeYouTubeHtml(item.snippet.channelTitle),
          thumbnailUrl:
            pickYouTubeThumbnail(item.snippet.thumbnails)?.url ?? null,
          durationMs: durations.get(item.id.videoId as string) ?? 0,
        })),
        total: searchResponse.data.pageInfo?.totalResults ?? items.length,
        nextPageToken: searchResponse.data.nextPageToken ?? null,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw this.mapHttpError(error);
    }
  }

  private async fetchDurations(
    ids: string[],
    apiKey: string,
  ): Promise<Map<string, number>> {
    if (ids.length === 0) {
      return new Map();
    }

    const response = await firstValueFrom(
      this.httpService.get<YouTubeVideosResponse>(
        `${YOUTUBE_API_URL}${YOUTUBE_VIDEOS_PATH}`,
        {
          params: { key: apiKey, part: 'contentDetails', id: ids.join(',') },
          timeout: YOUTUBE_HTTP_TIMEOUT_MS,
        },
      ),
    );

    return new Map(
      (response.data.items ?? []).map((item) => [
        item.id,
        parseYouTubeDuration(item.contentDetails?.duration),
      ]),
    );
  }

  private mapHttpError(error: unknown): HttpException {
    if (!(error instanceof AxiosError)) {
      this.logger.error('YouTube search failed');
      return new BadGatewayException('YouTube search failed');
    }

    const status = error.response?.status;
    const reason = readYouTubeErrorReason(error.response?.data);
    const detail = reason ? ` reason=${reason}` : '';
    if (status === 403 && /quota/i.test(reason ?? '')) {
      this.logger.warn(`YouTube quota exceeded.${detail}`);
      return new HttpException(
        'YouTube quota exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.logger.error(
      `YouTube search failed (status=${status ?? 'network'})${detail}`,
    );
    return new BadGatewayException('YouTube search failed');
  }
}
