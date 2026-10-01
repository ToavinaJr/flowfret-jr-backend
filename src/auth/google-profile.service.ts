import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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
  audience?: string;
  issued_to?: string;
  expires_in?: string;
  sub?: string;
  user_id?: string;
  scope?: string;
}

@Injectable()
export class GoogleProfileService {
  private readonly logger = new Logger(GoogleProfileService.name);

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
      if (!tokenResponse.ok) {
        this.logValidationFailure('tokeninfo_rejected', {
          statusCode: tokenResponse.status,
        });
        throw new UnauthorizedException('Invalid Google access token.');
      }
      const tokenInfo = (await tokenResponse.json()) as GoogleTokenInfo;
      const tokenSubject = tokenInfo.sub ?? tokenInfo.user_id;
      const tokenClientIds = [
        tokenInfo.aud,
        tokenInfo.audience,
        tokenInfo.issued_to,
      ];
      const rejectionReason =
        !tokenClientIds.includes(clientId)
          ? 'audience_mismatch'
          : !tokenSubject
            ? 'subject_missing'
            : !Number.isFinite(Number(tokenInfo.expires_in)) ||
                Number(tokenInfo.expires_in) <= 0
              ? 'token_expired_or_expiry_missing'
              : !tokenInfo.scope?.split(/\s+/).includes('openid')
                ? 'openid_scope_missing'
                : null;
      if (rejectionReason) {
        this.logValidationFailure(rejectionReason);
        throw new UnauthorizedException('Invalid Google access token.');
      }
      const profileResponse = await fetch(
        'https://openidconnect.googleapis.com/v1/userinfo',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(this.timeoutMs()),
        },
      );
      if (!profileResponse.ok) {
        this.logValidationFailure('userinfo_rejected', {
          statusCode: profileResponse.status,
        });
        throw new UnauthorizedException('Invalid Google access token.');
      }
      const profile = (await profileResponse.json()) as GoogleUserInfo;
      if (!profile.sub || profile.sub !== tokenSubject) {
        this.logValidationFailure(
          profile.sub ? 'userinfo_subject_mismatch' : 'userinfo_subject_missing',
        );
        throw new UnauthorizedException('Invalid Google profile.');
      }
      return profile;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logValidationFailure('google_request_failed');
      throw new UnauthorizedException('Unable to reach Google.');
    }
  }

  private logValidationFailure(
    reason: string,
    details: { statusCode?: number } = {},
  ): void {
    this.logger.warn(
      JSON.stringify({
        event: 'google_profile.validation_failed',
        reason,
        ...details,
      }),
    );
  }

  private timeoutMs(): number {
    const value = Number(this.configService.get('EXTERNAL_HTTP_TIMEOUT_MS'));
    return Number.isInteger(value) && value > 0 ? value : 8_000;
  }
}
