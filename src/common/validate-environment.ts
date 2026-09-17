const POSITIVE_INTEGER_KEYS = [
  'REDIS_PORT',
  'TRANSCRIPTION_CONCURRENCY',
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
  'TRANSCRIPTION_MAX_DURATION_SECONDS',
] as const;

export function validateEnvironment(
  environment: Record<string, unknown>,
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
  if (environment.NODE_ENV === 'production') {
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
  }
  return environment;
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
