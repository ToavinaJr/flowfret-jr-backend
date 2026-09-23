import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { AuthPayload } from '../graphql/graphql.types';
import type { AuthSessionPayload } from './auth-session.service';

export function readRefreshToken(
  request: Request,
  name: string,
): string | null {
  const encodedName = encodeURIComponent(name);
  const match = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${encodedName}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(encodedName.length + 1));
  } catch {
    return null;
  }
}

export function cookieName(config: ConfigService): string {
  return config.get<string>('REFRESH_COOKIE_NAME') ?? 'fretflow_refresh';
}

export function cookieOptions(
  config: ConfigService,
  withMaxAge = false,
): CookieOptions {
  const production = config.get<string>('NODE_ENV') === 'production';
  const days = Number(config.get<string>('REFRESH_TOKEN_TTL_DAYS') ?? 30);
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    path: '/graphql',
    ...(withMaxAge ? { maxAge: days * 24 * 60 * 60 * 1000 } : {}),
  };
}

export function writeSessionCookie(
  response: Response,
  config: ConfigService,
  session: AuthSessionPayload,
): AuthPayload {
  response.cookie(
    cookieName(config),
    session.refreshToken,
    cookieOptions(config, true),
  );
  return { accessToken: session.accessToken, user: session.user };
}
