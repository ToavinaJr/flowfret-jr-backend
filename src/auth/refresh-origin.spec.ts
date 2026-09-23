import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { assertRefreshOrigin } from './refresh-origin';

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('assertRefreshOrigin', () => {
  it('accepts a configured production origin', () => {
    const settings = config({
      NODE_ENV: 'production',
      APP_URL: 'https://flowfret-jr.vercel.app',
    });

    expect(() =>
      assertRefreshOrigin(
        { headers: { origin: 'https://flowfret-jr.vercel.app' } },
        settings,
      ),
    ).not.toThrow();
  });

  it('rejects a missing production origin', () => {
    expect(() =>
      assertRefreshOrigin(
        { headers: {} },
        config({ NODE_ENV: 'production', APP_URL: 'https://example.com' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects an origin outside the configured allow-list', () => {
    expect(() =>
      assertRefreshOrigin(
        { headers: { origin: 'https://evil.example' } },
        config({ NODE_ENV: 'production', APP_URL: 'https://example.com' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('keeps origin-less local tools working in development', () => {
    expect(() =>
      assertRefreshOrigin({ headers: {} }, config({ NODE_ENV: 'test' })),
    ).not.toThrow();
  });
});
