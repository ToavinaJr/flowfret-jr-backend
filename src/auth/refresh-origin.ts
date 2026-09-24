import { ForbiddenException, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

type OriginRequest = {
  headers: {
    origin?: string | string[];
  };
};

const DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];
const logger = new Logger('RefreshOrigin');

export const AUTH_ORIGIN_FORBIDDEN = 'AUTH_ORIGIN_FORBIDDEN';

export function assertRefreshOrigin(
  request: OriginRequest,
  config: ConfigService,
): void {
  const production = config.get<string>('NODE_ENV') === 'production';
  const rawOrigin = request.headers.origin;
  const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;

  if (!origin) {
    if (production) {
      logger.warn(
        JSON.stringify({ event: 'auth.origin_rejected', origin: '<missing>' }),
      );
      throw forbiddenOrigin();
    }
    return;
  }

  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    throw forbiddenOrigin();
  }

  if (!allowedOrigins(config, production).has(normalized)) {
    logger.warn(
      JSON.stringify({ event: 'auth.origin_rejected', origin: normalized }),
    );
    throw forbiddenOrigin();
  }
}

function allowedOrigins(
  config: ConfigService,
  production: boolean,
): ReadonlySet<string> {
  const configured = [
    config.get<string>('APP_URL'),
    ...(config.get<string>('CORS_ORIGINS') ?? '').split(','),
    ...(production ? [] : DEVELOPMENT_ORIGINS),
  ];
  return new Set(
    configured.flatMap((value) => {
      if (!value?.trim()) return [];
      try {
        return [new URL(value.trim()).origin];
      } catch {
        return [];
      }
    }),
  );
}

function forbiddenOrigin(): ForbiddenException {
  return new ForbiddenException({
    code: AUTH_ORIGIN_FORBIDDEN,
    message: 'Request origin is not allowed.',
  });
}
