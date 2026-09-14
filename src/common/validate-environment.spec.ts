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
    };

    expect(validateEnvironment(environment)).toBe(environment);
  });
});
