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
  YouTubeThumbnail,
  YouTubeVideosResponse,
} from './youtube.types';

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
          title: this.decodeHtml(item.snippet.title),
          channelId: item.snippet.channelId,
          channelTitle: this.decodeHtml(item.snippet.channelTitle),
          thumbnailUrl:
            this.pickThumbnail(item.snippet.thumbnails)?.url ?? null,
          durationMs: durations.get(item.id.videoId as string) ?? 0,
        })),
        total: searchResponse.data.pageInfo?.totalResults ?? items.length,
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
        this.parseDuration(item.contentDetails?.duration),
      ]),
    );
  }

  private parseDuration(value?: string): number {
    if (!value) return 0;
    const match = value.match(
      /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/,
    );
    if (!match) return 0;
    const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
    return (
      (Number(days) * 86400 +
        Number(hours) * 3600 +
        Number(minutes) * 60 +
        Number(seconds)) *
      1000
    );
  }

  private pickThumbnail(
    thumbnails: Record<string, YouTubeThumbnail | undefined>,
  ): YouTubeThumbnail | undefined {
    return (
      thumbnails.maxres ??
      thumbnails.standard ??
      thumbnails.high ??
      thumbnails.medium ??
      thumbnails.default
    );
  }

  private decodeHtml(value: string): string {
    const named: Record<string, string> = {
      amp: '&',
      apos: "'",
      gt: '>',
      lt: '<',
      quot: '"',
    };
    return value.replace(
      /&(#x?[0-9a-f]+|[a-z]+);/gi,
      (entity, code: string) => {
        if (code.startsWith('#')) {
          const hexadecimal = code[1]?.toLowerCase() === 'x';
          const parsed = Number.parseInt(
            code.slice(hexadecimal ? 2 : 1),
            hexadecimal ? 16 : 10,
          );
          return Number.isFinite(parsed)
            ? String.fromCodePoint(parsed)
            : entity;
        }
        return named[code.toLowerCase()] ?? entity;
      },
    );
  }

  private mapHttpError(error: unknown): HttpException {
    if (!(error instanceof AxiosError)) {
      this.logger.error('YouTube search failed');
      return new BadGatewayException('YouTube search failed');
    }

    const status = error.response?.status;
    const reason = this.readReason(error.response?.data);
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

  private readReason(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const error = (data as Record<string, unknown>).error;
    if (!error || typeof error !== 'object') return undefined;
    const errors = (error as Record<string, unknown>).errors;
    if (!Array.isArray(errors)) return undefined;
    const first = errors[0];
    if (!first || typeof first !== 'object') return undefined;
    const reason = (first as Record<string, unknown>).reason;
    return typeof reason === 'string' ? reason : undefined;
  }
}
