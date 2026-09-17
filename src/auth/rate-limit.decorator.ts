import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate-limit';

export type RateLimitOptions = {
  limit: number;
  windowSeconds: number;
  failClosed?: boolean;
};

export const RateLimits = (...options: RateLimitOptions[]) =>
  SetMetadata(RATE_LIMIT_KEY, options);

export const RateLimit = (
  limit: number,
  windowSeconds: number,
  failClosed = false,
) => RateLimits({ limit, windowSeconds, failClosed });
