import { validate } from 'class-validator';
import {
  GoogleAuthInput,
  LoginInput,
  CreatePostInput,
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

  it('accepts a valid post payload with the global whitelist enabled', async () => {
    const input = Object.assign(new CreatePostInput(), {
      content: 'Mon nouveau morceau',
    });

    await expect(
      validate(input, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual([]);
    expect(input).toMatchObject({
      content: 'Mon nouveau morceau',
    });
  });

  it('rejects a client-controlled post author', async () => {
    const input = Object.assign(new CreatePostInput(), {
      authorId: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
      content: 'Mon nouveau morceau',
    });

    const errors = await validate(input, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toContain('authorId');
  });
});
