import type { ConfigService } from '@nestjs/config';
import { cookieOptions } from './auth-cookie.utils';

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('refresh session cookie options', () => {
  it('uses secure, HTTP-only cross-site cookies in production', () => {
    expect(cookieOptions(config({ NODE_ENV: 'production' }), true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/graphql',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  });

  it('uses lax cookies for local development', () => {
    expect(cookieOptions(config({ NODE_ENV: 'development' }))).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/graphql',
    });
  });
});
