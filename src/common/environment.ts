const DEFAULT_NODE_ENV = 'development';

export interface EnvironmentConfig {
  DATABASE_URL?: string;
  DATABASE_POOL_MAX?: string;
  TRANSCRIPTION_DATABASE_TIMEOUT_MS?: string;
  DEBUG?: string;
}

/** Environment paths are resolved before Nest's ConfigModule can be injected. */
export function getEnvironmentFilePaths(): string[] {
  const nodeEnv = process.env.NODE_ENV ?? DEFAULT_NODE_ENV;
  return [`.env.${nodeEnv}.local`, `.env.${nodeEnv}`, '.env.local', '.env'];
}

/** Used only for Nest decorators, which run before dependency injection. */
export function getEnvironmentPositiveInteger(
  key: 'TRANSCRIPTION_CONCURRENCY' | 'AUDIO_STEMS_CONCURRENCY',
  fallback: number,
): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
}
