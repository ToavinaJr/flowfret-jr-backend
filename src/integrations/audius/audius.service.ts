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
  AUDIUS_ACCESS_TOKEN_KEY,
  AUDIUS_API_URL,
  AUDIUS_HTTP_TIMEOUT_MS,
  AUDIUS_SEARCH_MAX_LIMIT,
  AUDIUS_SEARCH_MIN_LIMIT,
  AUDIUS_SEARCH_PATH,
  AUDIUS_TRACKS_PATH,
} from './audius.constants';
import type {
  AudiusSearchResponse,
  AudiusSearchResult,
  AudiusTrackResponse,
} from './audius.types';

@Injectable()
export class AudiusService {
  private readonly logger = new Logger(AudiusService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async searchTracks(
    query: string,
    limit: number,
  ): Promise<AudiusSearchResult> {
    const accessToken = getRequiredConfig(
      this.configService,
      AUDIUS_ACCESS_TOKEN_KEY,
    );
    const clampedLimit = Math.min(
      AUDIUS_SEARCH_MAX_LIMIT,
      Math.max(AUDIUS_SEARCH_MIN_LIMIT, Math.trunc(limit)),
    );

    try {
      const response = await firstValueFrom(
        this.httpService.get<AudiusSearchResponse>(
          `${AUDIUS_API_URL}${AUDIUS_SEARCH_PATH}`,
          {
            params: {
              query,
              limit: clampedLimit,
              sort_method: 'relevant',
            },
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: AUDIUS_HTTP_TIMEOUT_MS,
          },
        ),
      );
      const tracks = (response.data.data ?? []).filter((track) =>
        this.isStreamable(track.isStreamable, track.is_streamable),
      );
      return { tracks, total: tracks.length };
    } catch (error) {
      throw this.mapHttpError(error);
    }
  }

  async getFreshStreamUrl(
    trackId: string,
    _currentUrl?: string,
  ): Promise<string> {
    void _currentUrl;
    this.logger.log(
      JSON.stringify({ event: 'audius.stream_refresh_started', trackId }),
    );
    const accessToken = getRequiredConfig(
      this.configService,
      AUDIUS_ACCESS_TOKEN_KEY,
    );
    try {
      const response = await firstValueFrom(
        this.httpService.get<AudiusTrackResponse>(
          `${AUDIUS_API_URL}${AUDIUS_TRACKS_PATH}/${encodeURIComponent(trackId)}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: AUDIUS_HTTP_TIMEOUT_MS,
          },
        ),
      );
      if (!response.data.data) {
        throw new BadGatewayException('Audius stream is unavailable');
      }
      // A stream.url points at one signed storage node and can already be dead
      // when the queued job starts. The canonical endpoint redirects to a
      // freshly selected node when the download actually begins.
      const streamUrl = `${AUDIUS_API_URL}${AUDIUS_TRACKS_PATH}/${encodeURIComponent(trackId)}/stream`;
      this.logger.log(
        JSON.stringify({
          event: 'audius.stream_refresh_completed',
          trackId,
          streamHost: new URL(streamUrl).hostname,
        }),
      );
      return streamUrl;
    } catch (error) {
      throw this.mapHttpError(error);
    }
  }

  private isStreamable(camel?: boolean | string, snake?: boolean): boolean {
    const value = camel ?? snake;
    return value !== false && value !== 'false';
  }

  private mapHttpError(error: unknown): HttpException {
    if (!(error instanceof AxiosError)) {
      this.logger.error('Audius search failed');
      return new BadGatewayException('Audius search failed');
    }
    const status = error.response?.status;
    if (status === 429) {
      this.logger.warn('Audius rate limit exceeded');
      return new HttpException(
        'Audius rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.logger.error(`Audius search failed (status=${status ?? 'network'})`);
    return new BadGatewayException('Audius search failed');
  }
}
