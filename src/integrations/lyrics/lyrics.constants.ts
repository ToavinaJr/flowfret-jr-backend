export const LRCLIB_DEFAULT_BASE_URL = 'https://lrclib.net';
export const LRCLIB_DEFAULT_CLIENT_NAME = 'FlowFret';
export const LRCLIB_DEFAULT_TIMEOUT_MS = 5_000;
export const LYRICS_CACHE_TTL_SECONDS = 24 * 60 * 60;
export const LYRICS_NOT_FOUND_TTL_SECONDS = 10 * 60;
export const GENIUS_LYRICS_PAGE_TIMEOUT_MS = 8_000;
export const GENIUS_LYRICS_USER_AGENT =
  'Mozilla/5.0 (compatible; FlowFretBot/1.0; +https://flowfret.app)';
export const LYRICS_WEB_PAGE_TIMEOUT_MS = 8_000;
export const LYRICS_WEB_MAX_PAGE_BYTES = 1_000_000;
export const LYRICS_WEB_USER_AGENT =
  'Mozilla/5.0 (compatible; FlowFretBot/1.0; +https://flowfret.app)';
export const LYRICS_WEB_SEARCH_RESULT_COUNT = 3;
export const LYRICS_GROUNDING_MIN_OVERLAP_RATIO = 0.8;
// Providers whose text is never estimate-synced (see
// LyricsService.estimateTimingIfUnsynced): their lines are a guess, not a
// transcription with any real per-line timing to anchor an estimate on.
export const LYRICS_PROVIDER_TONONKIRA = 'tononkira';
export const LYRICS_PROVIDER_LLM_WEB_SEARCH = 'llm-web-search';
