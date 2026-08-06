export const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';
export const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
export const SPOTIFY_TOKEN_PATH = '/api/token';
export const SPOTIFY_SEARCH_PATH = '/search';

/** Renew token this many ms before Spotify expiry. */
export const SPOTIFY_TOKEN_EXPIRY_SKEW_MS = 60_000;

export const SPOTIFY_HTTP_TIMEOUT_MS = 10_000;

/** Spotify Dev Mode search limit max is 10 (Feb 2026). */
export const SPOTIFY_SEARCH_MAX_LIMIT = 10;
export const SPOTIFY_SEARCH_MIN_LIMIT = 1;
export const SPOTIFY_SEARCH_DEFAULT_LIMIT = 10;

export const SPOTIFY_CLIENT_ID_KEY = 'SPOTIFY_CLIENT_ID';
export const SPOTIFY_CLIENT_SECRET_KEY = 'SPOTIFY_CLIENT_SECRET';
