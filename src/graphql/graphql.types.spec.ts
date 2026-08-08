import { validate } from 'class-validator';
import {
  GoogleAuthInput,
  LoginInput,
  RegisterInput,
  VerifyEmailInput,
} from './graphql.types';

describe('auth GraphQL input validation', () => {
  it('accepts valid authentication inputs', async () => {
    const register = Object.assign(new RegisterInput(), {
      email: 'guitarist@example.com',
      username: 'guitarist',
      password: 'valid-password',
    });
    const login = Object.assign(new LoginInput(), {
      email: 'guitarist@example.com',
      password: 'valid-password',
    });
    const verification = Object.assign(new VerifyEmailInput(), {
      token: 'a'.repeat(64),
      code: '1234',
    });
    const google = Object.assign(new GoogleAuthInput(), {
      accessToken: 'google-token',
    });

    await expect(validate(register, { whitelist: true })).resolves.toEqual([]);
    await expect(validate(login, { whitelist: true })).resolves.toEqual([]);
    await expect(validate(verification, { whitelist: true })).resolves.toEqual(
      [],
    );
    await expect(validate(google, { whitelist: true })).resolves.toEqual([]);
  });

  it('rejects an invalid registration payload', async () => {
    const input = Object.assign(new RegisterInput(), {
      email: 'invalid',
      username: 'ab',
      password: 'short',
    });

    const errors = await validate(input, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['email', 'username', 'password']),
    );
  });
});
