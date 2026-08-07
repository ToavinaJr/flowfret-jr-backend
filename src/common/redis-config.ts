import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getRedisOptions(config: ConfigService): RedisOptions {
  const connectionUrl =
    config.get<string>('REDIS_URL') || config.get<string>('REDIS_PRIVATE_URL');

  if (connectionUrl) {
    const parsed = new URL(connectionUrl);
    if (!['redis:', 'rediss:'].includes(parsed.protocol))
      throw new Error('REDIS_URL must use redis:// or rediss://');
    const database = parsed.pathname.replace(/^\//, '');
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      username: parsed.username ? decode(parsed.username) : undefined,
      password: parsed.password ? decode(parsed.password) : undefined,
      db: database ? Number(database) : undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectTimeout: Number(
        config.get('TRANSCRIPTION_QUEUE_TIMEOUT_MS') ?? 10_000,
      ),
      lazyConnect: true,
    };
  }

  const host = config.get<string>('REDIS_HOST');
  if (!host && config.get<string>('NODE_ENV') === 'production')
    throw new Error(
      'Redis is not configured. Set REDIS_URL or REDIS_HOST in Render.',
    );

  return {
    host: host ?? 'localhost',
    port: Number(config.get('REDIS_PORT') ?? 6379),
    username: config.get<string>('REDIS_USERNAME') || undefined,
    password: config.get<string>('REDIS_PASSWORD') || undefined,
    tls: config.get<string>('REDIS_TLS') === 'true' ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: Number(
      config.get('TRANSCRIPTION_QUEUE_TIMEOUT_MS') ?? 10_000,
    ),
    lazyConnect: true,
  };
}

export function getRedisConnectionSummary(options: RedisOptions) {
  return {
    host: options.host,
    port: options.port,
    tls: Boolean(options.tls),
    usernameConfigured: Boolean(options.username),
    passwordConfigured: Boolean(options.password),
    database: options.db ?? 0,
  };
}
