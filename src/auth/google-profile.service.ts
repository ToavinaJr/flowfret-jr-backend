import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GENERIC_GOOGLE_ERROR } from './auth.constants';

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean | string;
  name?: string;
  given_name?: string;
  picture?: string;
}

interface GoogleTokenInfo {
  aud?: string;
  expires_in?: string;
  user_id?: string;
  scope?: string;
}

@Injectable()
export class GoogleProfileService {
  constructor(private readonly configService: ConfigService) {}

  async fetch(accessToken: string): Promise<GoogleUserInfo> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID')?.trim();
    if (!clientId) throw new UnauthorizedException(GENERIC_GOOGLE_ERROR);
    const timeout = { signal: AbortSignal.timeout(this.timeoutMs()) };
    try {
      const tokenResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
        timeout,
      );
      if (!tokenResponse.ok)
        throw new UnauthorizedException('Invalid Google access token.');
      const tokenInfo = (await tokenResponse.json()) as GoogleTokenInfo;
      if (
        tokenInfo.aud !== clientId ||
        !tokenInfo.user_id ||
        !Number.isFinite(Number(tokenInfo.expires_in)) ||
        Number(tokenInfo.expires_in) <= 0 ||
        !tokenInfo.scope?.split(' ').includes('openid')
      )
        throw new UnauthorizedException('Invalid Google access token.');
      const profileResponse = await fetch(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(this.timeoutMs()),
        },
      );
      if (!profileResponse.ok)
        throw new UnauthorizedException('Invalid Google access token.');
      const profile = (await profileResponse.json()) as GoogleUserInfo;
      if (!profile.sub || profile.sub !== tokenInfo.user_id)
        throw new UnauthorizedException('Invalid Google profile.');
      return profile;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Unable to reach Google.');
    }
  }

  private timeoutMs(): number {
    const value = Number(this.configService.get('EXTERNAL_HTTP_TIMEOUT_MS'));
    return Number.isInteger(value) && value > 0 ? value : 8_000;
  }
}
