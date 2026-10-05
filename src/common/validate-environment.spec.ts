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
      APP_URL: 'https://flowfret.app',
      CORS_ORIGINS: 'https://www.flowfret.app',
      SMTP_USER: 'mailer@gmail.com',
      SMTP_PASSWORD: 'google-app-password',
      SMTP_FROM_EMAIL: 'mailer@gmail.com',
      SMTP_PORT: '465',
    };

    expect(validateEnvironment(environment)).toBe(environment);
  });

  it('requires Gmail SMTP credentials in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-secure-secret-containing-32-chars',
        APP_URL: 'https://flowfret.app',
      }),
    ).toThrow('SMTP_USER must be configured in production');

    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-secure-secret-containing-32-chars',
        APP_URL: 'https://flowfret.app',
        SMTP_USER: 'mailer@gmail.com',
      }),
    ).toThrow('SMTP_PASSWORD must be configured in production');
  });

  it('validates SMTP credentials and supported TLS ports', () => {
    expect(() =>
      validateEnvironment({
        SMTP_USER: 'mailer@gmail.com',
        SMTP_PASSWORD: 'app-password',
        SMTP_PORT: '2525',
      }),
    ).toThrow('SMTP_PORT must be 465 or 587');
    expect(() =>
      validateEnvironment({
        SMTP_USER: 'invalid',
        SMTP_PASSWORD: 'app-password',
      }),
    ).toThrow('SMTP_USER must contain a valid email address');
    expect(() =>
      validateEnvironment({
        SMTP_USER: 'mailer@gmail.com',
      }),
    ).toThrow('SMTP_USER and SMTP_PASSWORD must be configured together');
  });

  it('rejects HTTP application URLs in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-secure-secret-containing-32-chars',
        APP_URL: 'http://flowfret.app',
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

  it('rejects unknown music providers', () => {
    expect(() => validateEnvironment({ MUSIC_PROVIDER: 'SOUNDCLOUD' })).toThrow(
      'MUSIC_PROVIDER must be one of: AUDIUS, SPOTIFY, YOUTUBE',
    );
  });

  it('requires Spotify credentials when Spotify is selected in production', () => {
    const environment = {
      NODE_ENV: 'production',
      JWT_SECRET: 'a-secure-secret-containing-32-chars',
      APP_URL: 'https://flowfret.app',
      MUSIC_PROVIDER: 'SPOTIFY',
    };

    expect(() =>
      validateEnvironment(environment, { requireMail: false }),
    ).toThrow('SPOTIFY_CLIENT_ID must be configured in production');

    expect(() =>
      validateEnvironment(
        { ...environment, SPOTIFY_CLIENT_ID: 'client-id' },
        { requireMail: false },
      ),
    ).toThrow('SPOTIFY_CLIENT_SECRET must be configured in production');
  });

  it('rejects unknown transcription providers', () => {
    expect(() => validateEnvironment({ LLM_PROVIDER: 'openai' })).toThrow(
      'LLM_PROVIDER must be one of: whisper, azure',
    );
  });

  it('validates database pool and server port values', () => {
    expect(() => validateEnvironment({ DATABASE_POOL_MAX: '2.5' })).toThrow(
      'DATABASE_POOL_MAX must be a positive integer',
    );
    expect(() => validateEnvironment({ PORT: '0' })).toThrow(
      'PORT must be a positive integer',
    );
  });
});
