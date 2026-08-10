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
  return environment;
}
