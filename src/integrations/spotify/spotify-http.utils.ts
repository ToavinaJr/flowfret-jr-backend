import {
  SPOTIFY_SEARCH_DEFAULT_LIMIT,
  SPOTIFY_SEARCH_MAX_LIMIT,
  SPOTIFY_SEARCH_MIN_LIMIT,
} from './spotify.constants';

export function clampSpotifySearchLimit(limit: number): number {
  if (!Number.isFinite(limit)) return SPOTIFY_SEARCH_DEFAULT_LIMIT;
  return Math.min(
    SPOTIFY_SEARCH_MAX_LIMIT,
    Math.max(SPOTIFY_SEARCH_MIN_LIMIT, Math.trunc(limit)),
  );
}

export function readRetryAfterHeader(headers: unknown): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const value = (headers as Record<string, unknown>)['retry-after'];
  return typeof value === 'string' ? value : undefined;
}
