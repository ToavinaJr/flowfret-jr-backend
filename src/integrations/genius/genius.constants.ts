export const GENIUS_API_URL = 'https://api.genius.com';
export const GENIUS_SEARCH_PATH = '/search';

export const GENIUS_HTTP_TIMEOUT_MS = 10_000;
export const GENIUS_MAX_CONCURRENCY = 3;

export const GENIUS_MATCH_MIN_SCORE = 0.55;

export const GENIUS_CACHE_TTL_MS = 30 * 60 * 1000;
export const GENIUS_CACHE_MAX_ENTRIES = 500;

export const GENIUS_ACCESS_TOKEN_KEY = 'GENIUS_ACCESS_TOKEN';

export const GENIUS_NOISE_PHRASES = [
  'official video',
  'official audio',
  'lyric video',
  'lyrics video',
  'music video',
  'remastered',
  'remaster',
  'live',
  'acoustic',
  'radio edit',
  'explicit',
] as const;
