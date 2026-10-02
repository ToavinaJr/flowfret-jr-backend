const POSITIVE_INTEGER_KEYS = [
  'PORT',
  'DATABASE_POOL_MAX',
  'TRANSCRIPTION_DATABASE_TIMEOUT_MS',
  'REDIS_PORT',
  'TRANSCRIPTION_CONCURRENCY',
  'TRANSCRIPTION_QUEUE_TIMEOUT_MS',
  'TRANSCRIPTION_ATTEMPTS',
  'TRANSCRIPTION_TIMEOUT_MS',
  'TRANSCRIPTION_INITIAL_BUFFER_SECONDS',
  'TRANSCRIPTION_MIN_AHEAD_SECONDS',
  'TRANSCRIPTION_RESUME_AHEAD_SECONDS',
  'TRANSCRIPTION_MAX_AUDIO_SIZE_MB',
  'TRANSCRIPTION_MAX_REDIRECTS',
  'TRANSCRIPTION_DOWNLOAD_TIMEOUT_MS',
  'REFRESH_TOKEN_TTL_DAYS',
  'LRCLIB_TIMEOUT_MS',
  'UPLOAD_MAX_CONCURRENT_GLOBAL',
  'UPLOAD_MAX_CONCURRENT_PER_USER',
  'UPLOAD_MAX_STORAGE_BYTES_PER_USER',
  'EXTERNAL_HTTP_TIMEOUT_MS',
  'TRANSCRIPTION_MAX_DURATION_SECONDS',
  'TRANSCRIPTION_MAX_QUEUE_DEPTH',
  'GRAPHQL_MAX_DEPTH',
  'GRAPHQL_MAX_FIELDS',
  'GRAPHQL_MAX_ALIASES',
  'GRAPHQL_MAX_COMPLEXITY',
  'GRAPHQL_BODY_LIMIT_KB',
  'YOUTUBE_AUDIO_MAX_SIZE_MB',
  'YOUTUBE_AUDIO_MAX_DURATION_SECONDS',
  'YOUTUBE_AUDIO_DOWNLOAD_TIMEOUT_MS',
  'YOUTUBE_AUDIO_MAX_CONCURRENT',
] as const;

const ALLOWED_MUSIC_PROVIDERS = ['AUDIUS', 'SPOTIFY', 'YOUTUBE'] as const;
const ALLOWED_TRANSCRIPTION_PROVIDERS = ['whisper', 'azure'] as const;

export function validateEnvironment(
  environment: Record<string, unknown>,
  options: { requireMail?: boolean; requireWeb?: boolean } = {},
): Record<string, unknown> {
  for (const key of POSITIVE_INTEGER_KEYS) {
    const raw = environment[key];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0)
      throw new Error(`${key} must be a positive integer`);
  }
  const redisTls = environment.REDIS_TLS;
  if (redisTls !== undefined && typeof redisTls !== 'string')
    throw new Error('REDIS_TLS must be true or false');
  if (typeof redisTls === 'string' && !['true', 'false'].includes(redisTls))
    throw new Error('REDIS_TLS must be true or false');
  validateEnum(
    environment.MUSIC_PROVIDER,
    'MUSIC_PROVIDER',
    ALLOWED_MUSIC_PROVIDERS,
  );
  validateEnum(
    environment.LLM_PROVIDER,
    'LLM_PROVIDER',
    ALLOWED_TRANSCRIPTION_PROVIDERS,
  );
  if (
    environment.NODE_ENV === 'production' &&
    options.requireWeb !== false
  ) {
    const jwtSecret = environment.JWT_SECRET;
    if (typeof jwtSecret !== 'string' || jwtSecret.length < 32) {
      throw new Error(
        'JWT_SECRET must contain at least 32 characters in production',
      );
    }
    requireHttpsUrl(environment.APP_URL, 'APP_URL');
    const corsOrigins = environment.CORS_ORIGINS;
    if (corsOrigins !== undefined && typeof corsOrigins !== 'string') {
      throw new Error('CORS_ORIGINS must contain a comma-separated URL list');
    }
    const origins = (corsOrigins ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    for (const origin of origins) requireHttpsUrl(origin, 'CORS_ORIGINS');
    if (environment.MUSIC_PROVIDER === 'SPOTIFY') {
      requireNonEmpty(environment.SPOTIFY_CLIENT_ID, 'SPOTIFY_CLIENT_ID');
      requireNonEmpty(
        environment.SPOTIFY_CLIENT_SECRET,
        'SPOTIFY_CLIENT_SECRET',
      );
    }
    if (options.requireMail !== false) {
      requireNonEmpty(environment.SENDGRID_API_KEY, 'SENDGRID_API_KEY');
      requireEmail(environment.SENDGRID_FROM_EMAIL, 'SENDGRID_FROM_EMAIL');
    }
  }
  return environment;
}

function requireNonEmpty(value: unknown, key: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be configured in production`);
  }
}

function requireEmail(value: unknown, key: string): void {
  requireNonEmpty(value, key);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value as string)) {
    throw new Error(`${key} must contain a valid email address`);
  }
}

function validateEnum(
  value: unknown,
  key: string,
  allowed: readonly string[],
): void {
  if (value === undefined || value === '') return;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${key} must be one of: ${allowed.join(', ')}`);
  }
}

function requireHttpsUrl(value: unknown, key: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be configured in production`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must contain a valid URL`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${key} must use HTTPS in production`);
  }
}
