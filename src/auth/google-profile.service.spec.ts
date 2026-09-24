import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleProfileService } from './google-profile.service';

const accessToken = 'google-access-token';
const profile = {
  sub: 'google-user-id',
  email: 'alice@example.com',
  email_verified: true,
  name: 'Alice',
};

function setup() {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'GOOGLE_CLIENT_ID') return 'google-client-id';
      if (key === 'EXTERNAL_HTTP_TIMEOUT_MS') return '8000';
      return undefined;
    }),
  };
  return new GoogleProfileService(config as unknown as ConfigService);
}

function response(body: object, ok = true): Response {
  return { ok, json: jest.fn().mockResolvedValue(body) } as unknown as Response;
}

describe('GoogleProfileService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('accepts the standard OIDC sub claim returned for an access token', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        response({
          aud: 'google-client-id',
          sub: profile.sub,
          expires_in: '3599',
          scope: 'openid email profile',
        }),
      )
      .mockResolvedValueOnce(response(profile));

    await expect(setup().fetch(accessToken)).resolves.toEqual(profile);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://openidconnect.googleapis.com/v1/userinfo',
      expect.objectContaining({
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
  });

  it('still accepts the legacy user_id claim', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        response({
          aud: 'google-client-id',
          user_id: profile.sub,
          expires_in: '3599',
          scope: 'openid email profile',
        }),
      )
      .mockResolvedValueOnce(response(profile));

    await expect(setup().fetch(accessToken)).resolves.toEqual(profile);
  });

  it('rejects a token issued for another OAuth client', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      response({
        aud: 'another-client-id',
        sub: profile.sub,
        expires_in: '3599',
        scope: 'openid email profile',
      }),
    );

    await expect(setup().fetch(accessToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a profile that does not match the validated token subject', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        response({
          aud: 'google-client-id',
          sub: profile.sub,
          expires_in: '3599',
          scope: 'openid email profile',
        }),
      )
      .mockResolvedValueOnce(response({ ...profile, sub: 'other-user-id' }));

    await expect(setup().fetch(accessToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
