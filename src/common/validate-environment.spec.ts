import { validateEnvironment } from './validate-environment';

describe('validateEnvironment', () => {
  it('requires a strong JWT secret in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_SECRET: 'too-short',
      }),
    ).toThrow('JWT_SECRET must contain at least 32 characters');
  });

  it('accepts a production secret containing at least 32 characters', () => {
    const environment = {
      NODE_ENV: 'production',
      JWT_SECRET: 'a-secure-secret-containing-32-chars',
      APP_URL: 'https://fretflow.app',
      CORS_ORIGINS: 'https://www.fretflow.app',
    };

    expect(validateEnvironment(environment)).toBe(environment);
  });

  it('rejects HTTP application URLs in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-secure-secret-containing-32-chars',
        APP_URL: 'http://fretflow.app',
      }),
    ).toThrow('APP_URL must use HTTPS in production');
  });

  it('validates resource quota values', () => {
    expect(() =>
      validateEnvironment({
        UPLOAD_MAX_CONCURRENT_GLOBAL: '0',
      }),
    ).toThrow('UPLOAD_MAX_CONCURRENT_GLOBAL must be a positive integer');
  });
});
