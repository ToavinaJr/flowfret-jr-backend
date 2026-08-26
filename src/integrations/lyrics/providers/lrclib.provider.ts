import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  LRCLIB_DEFAULT_BASE_URL,
  LRCLIB_DEFAULT_CLIENT_NAME,
  LRCLIB_DEFAULT_TIMEOUT_MS,
} from '../lyrics.constants';
import type { LyricsProvider } from '../interfaces/lyrics-provider.interface';
import type { Lyrics, TrackMetadata } from '../interfaces/lyrics.interface';
import { parseLrc } from '../parsers/lrc.parser';

interface LrclibResponse {
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

@Injectable()
export class LrclibProvider implements LyricsProvider {
  private readonly logger = new Logger(LrclibProvider.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async findLyrics(track: TrackMetadata): Promise<Lyrics | null> {
    const attempts = this.buildAttempts(track);
    for (const params of attempts) {
      try {
        const response = await firstValueFrom(
          this.http.get<LrclibResponse>(`${this.baseUrl()}/api/get`, {
            params,
            headers: {
              'Lrclib-Client': `${this.config.get<string>('LRCLIB_CLIENT_NAME')?.trim() || LRCLIB_DEFAULT_CLIENT_NAME}/1.0`,
            },
            timeout: Number(
              this.config.get('LRCLIB_TIMEOUT_MS') ?? LRCLIB_DEFAULT_TIMEOUT_MS,
            ),
          }),
        );
        const lyrics = this.normalize(response.data);
        if (lyrics)
          this.logger.log(
            `LRCLIB match found for ${track.artist} - ${track.title}`,
          );
        return lyrics;
      } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 404)
          continue;
        if (error instanceof AxiosError && error.response?.status === 429) {
          this.logger.warn(`LRCLIB rate limited${this.retryAfter(error)}`);
          return null;
        }
        if (error instanceof AxiosError && error.code === 'ECONNABORTED')
          this.logger.warn('LRCLIB timeout');
        else
          this.logger.warn(
            `LRCLIB request failed (status=${error instanceof AxiosError ? (error.response?.status ?? 'network') : 'invalid'})`,
          );
        return null;
      }
    }
    this.logger.log(
      `LRCLIB lyrics not found for ${track.artist} - ${track.title}`,
    );
    return null;
  }

  private normalize(data: LrclibResponse | null | undefined): Lyrics | null {
    if (!data || typeof data !== 'object') return null;
    const instrumental = data.instrumental === true;
    const plainLyrics =
      typeof data.plainLyrics === 'string' && data.plainLyrics.trim()
        ? data.plainLyrics
        : undefined;
    const lines = parseLrc(
      typeof data.syncedLyrics === 'string' ? data.syncedLyrics : null,
    );
    if (!instrumental && !plainLyrics && lines.length === 0) return null;
    return {
      provider: 'lrclib',
      synced: lines.length > 0,
      instrumental,
      ...(plainLyrics ? { plainLyrics } : {}),
      lines,
    };
  }

  private buildAttempts(
    track: TrackMetadata,
  ): Array<Record<string, string | number>> {
    const base = { track_name: track.title, artist_name: track.artist };
    const attempts: Array<Record<string, string | number>> = [];
    if (track.album && track.duration)
      attempts.push({
        ...base,
        album_name: track.album,
        duration: track.duration,
      });
    if (track.duration) attempts.push({ ...base, duration: track.duration });
    if (!track.duration) attempts.push(base);
    const normalized = this.lightlyNormalizeTitle(track.title);
    if (normalized !== track.title && track.duration)
      attempts.push({
        track_name: normalized,
        artist_name: track.artist,
        duration: track.duration,
      });
    return attempts
      .filter(
        (attempt, index, all) =>
          all.findIndex(
            (candidate) =>
              JSON.stringify(candidate) === JSON.stringify(attempt),
          ) === index,
      )
      .slice(0, 3);
  }

  private lightlyNormalizeTitle(title: string): string {
    return (
      title
        .replace(
          /\s*(?:[-–—]\s*)?(?:\((?:official (?:audio|video)|lyric video|live)\)|-\s*remastered(?:\s+\d{4})?)\s*$/i,
          '',
        )
        .trim() || title
    );
  }

  private baseUrl(): string {
    const configured =
      this.config.get<string>('LRCLIB_BASE_URL')?.trim() ||
      LRCLIB_DEFAULT_BASE_URL;
    return configured.replace(/\/+$/, '');
  }

  private retryAfter(error: AxiosError): string {
    const value: unknown = error.response?.headers?.['retry-after'];
    return typeof value === 'string' || typeof value === 'number'
      ? ` (Retry-After=${String(value)})`
      : '';
  }
}
