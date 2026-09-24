import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { getRequiredConfig } from '../../common/required-config';
import {
  SPOTIFY_ACCOUNTS_URL,
  SPOTIFY_API_URL,
  SPOTIFY_CLIENT_ID_KEY,
  SPOTIFY_CLIENT_SECRET_KEY,
  SPOTIFY_HTTP_TIMEOUT_MS,
  SPOTIFY_SEARCH_DEFAULT_LIMIT,
  SPOTIFY_SEARCH_PATH,
  SPOTIFY_TOKEN_EXPIRY_SKEW_MS,
  SPOTIFY_TOKEN_PATH,
} from './spotify.constants';
import type {
  CachedSpotifyToken,
  SpotifySearchResult,
  SpotifySearchTracksResponse,
  SpotifyTokenResponse,
} from './spotify.types';
import {
  clampSpotifySearchLimit,
  readRetryAfterHeader,
} from './spotify-http.utils';

@Injectable()
export class SpotifyService {
  private readonly logger = new Logger(SpotifyService.name);
  private cachedToken: CachedSpotifyToken | null = null;
  private tokenPromise: Promise<string> | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async searchTracks(
    query: string,
    limit: number = SPOTIFY_SEARCH_DEFAULT_LIMIT,
    offset = 0,
  ): Promise<SpotifySearchResult> {
    const clampedLimit = clampSpotifySearchLimit(limit);
    const accessToken = await this.getAccessToken();

    try {
      return await this.executeSearch(query, clampedLimit, offset, accessToken);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.cachedToken = null;
        const refreshedToken = await this.getAccessToken(true);
        return this.executeSearch(query, clampedLimit, offset, refreshedToken);
      }
      throw error;
    }
  }

  private async getAccessToken(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      this.cachedToken &&
      Date.now() < this.cachedToken.expiresAtMs - SPOTIFY_TOKEN_EXPIRY_SKEW_MS
    ) {
      return this.cachedToken.accessToken;
    }

    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    this.tokenPromise = this.fetchAccessToken().finally(() => {
      this.tokenPromise = null;
    });

    return this.tokenPromise;
  }

  private async fetchAccessToken(): Promise<string> {
    const clientId = getRequiredConfig(
      this.configService,
      SPOTIFY_CLIENT_ID_KEY,
    );
    const clientSecret = getRequiredConfig(
      this.configService,
      SPOTIFY_CLIENT_SECRET_KEY,
    );
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post<SpotifyTokenResponse>(
          `${SPOTIFY_ACCOUNTS_URL}${SPOTIFY_TOKEN_PATH}`,
          new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
          {
            headers: {
              Authorization: `Basic ${basicAuth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: SPOTIFY_HTTP_TIMEOUT_MS,
          },
        ),
      );

      const { access_token: accessToken, expires_in: expiresIn } =
        response.data;
      this.cachedToken = {
        accessToken,
        expiresAtMs: Date.now() + expiresIn * 1000,
      };
      return accessToken;
    } catch (error) {
      throw this.mapHttpError(error, 'Spotify token request failed');
    }
  }

  private async executeSearch(
    query: string,
    limit: number,
    offset: number,
    accessToken: string,
  ): Promise<SpotifySearchResult> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<SpotifySearchTracksResponse>(
          `${SPOTIFY_API_URL}${SPOTIFY_SEARCH_PATH}`,
          {
            params: {
              q: query,
              type: 'track',
              limit,
              offset,
            },
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            timeout: SPOTIFY_HTTP_TIMEOUT_MS,
          },
        ),
      );

      const tracks = response.data.tracks?.items ?? [];
      const total = response.data.tracks?.total ?? 0;
      return {
        tracks,
        total,
        nextOffset:
          offset + tracks.length < total ? offset + tracks.length : null,
      };
    } catch (error) {
      throw this.mapHttpError(error, 'Spotify search failed');
    }
  }

  private mapHttpError(error: unknown, fallbackMessage: string): HttpException {
    if (!(error instanceof AxiosError)) {
      this.logger.error(fallbackMessage);
      return new BadGatewayException(fallbackMessage);
    }

    const status = error.response?.status;
    const retryAfter = readRetryAfterHeader(error.response?.headers);
    if (status === 401) {
      this.logger.error('Spotify authentication failed (status=401)');
      return new UnauthorizedException('Spotify authentication failed');
    }

    if (status === 429) {
      const suffix = retryAfter ? ` Retry after ${retryAfter}s.` : '';
      this.logger.warn(`Spotify rate limited.${suffix}`);
      return new HttpException(
        `Spotify rate limit exceeded.${suffix}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (status === 403) {
      this.logger.warn('Spotify access forbidden (status=403)');
      return new ForbiddenException({
        code: 'SPOTIFY_ACCESS_FORBIDDEN',
        message: 'Spotify search is unavailable for this application',
      });
    }

    this.logger.error(`${fallbackMessage} (status=${status ?? 'network'})`);
    return new BadGatewayException(fallbackMessage);
  }
}
