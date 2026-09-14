import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import type { CookieOptions, Request, Response } from 'express';
import {
  AuthPayload,
  GoogleAuthInput,
  LoginInput,
  RegisterInput,
  RegisterPendingPayload,
  RequestPasswordResetInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from '../graphql/graphql.types';
import { AuthService, AuthSessionPayload } from './auth.service';
import { Public } from './public.decorator';
import { isDebugEnabled } from '../common/debug';
import { RateLimit } from './rate-limit.decorator';

@Resolver()
export class AuthResolver {
  private readonly logger = new Logger(AuthResolver.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @RateLimit(5, 3600)
  @Mutation(() => RegisterPendingPayload)
  async register(
    @Args('data') data: RegisterInput,
  ): Promise<RegisterPendingPayload> {
    const startedAt = Date.now();
    // Never write identifiers or credentials to authentication logs.
    const details = { flow: 'password_registration' };
    if (isDebugEnabled()) {
      this.logger.debug(
        JSON.stringify({ event: 'register.started', ...details }),
      );
    }
    try {
      const result = await this.authService.register(data);
      if (isDebugEnabled()) {
        this.logger.debug(
          JSON.stringify({
            event: 'register.completed',
            ...details,
            durationMs: Date.now() - startedAt,
          }),
        );
      }
      return result;
    } catch (error) {
      if (isDebugEnabled()) {
        this.logger.error(
          JSON.stringify({
            event: 'register.failed',
            ...details,
            durationMs: Date.now() - startedAt,
          }),
          undefined,
        );
      }
      throw error;
    }
  }

  @Public()
  @RateLimit(10, 900)
  @Mutation(() => AuthPayload)
  async login(
    @Args('data') data: LoginInput,
    @Context('res') response: Response,
  ): Promise<AuthPayload> {
    return this.setSessionCookie(await this.authService.login(data), response);
  }

  @Public()
  @RateLimit(20, 900)
  @Mutation(() => AuthPayload)
  async loginWithGoogle(
    @Args('data') data: GoogleAuthInput,
    @Context('res') response: Response,
  ): Promise<AuthPayload> {
    return this.setSessionCookie(
      await this.authService.loginWithGoogle(data),
      response,
    );
  }

  @Public()
  @RateLimit(10, 3600)
  @Mutation(() => AuthPayload)
  async registerWithGoogle(
    @Args('data') data: GoogleAuthInput,
    @Context('res') response: Response,
  ): Promise<AuthPayload> {
    return this.setSessionCookie(
      await this.authService.registerWithGoogle(data),
      response,
    );
  }

  @Public()
  @RateLimit(10, 900)
  @Mutation(() => AuthPayload)
  async verifyEmail(
    @Args('data') data: VerifyEmailInput,
    @Context('res') response: Response,
  ): Promise<AuthPayload> {
    return this.setSessionCookie(
      await this.authService.verifyEmail(data),
      response,
    );
  }

  @Public()
  @RateLimit(3, 3600)
  @Mutation(() => RegisterPendingPayload)
  async resendVerificationEmail(
    @Args('token') token: string,
  ): Promise<RegisterPendingPayload> {
    return this.authService.resendVerificationEmail(token);
  }

  @Public()
  @RateLimit(3, 3600)
  @Mutation(() => Boolean)
  async requestPasswordReset(
    @Args('data') data: RequestPasswordResetInput,
  ): Promise<boolean> {
    await this.authService.requestPasswordReset(data.email);
    return true;
  }

  @Public()
  @RateLimit(5, 3600)
  @Mutation(() => Boolean)
  async resetPassword(
    @Args('data') data: ResetPasswordInput,
  ): Promise<boolean> {
    await this.authService.resetPassword(data.token, data.password);
    return true;
  }

  @Public()
  @RateLimit(60, 900)
  @Mutation(() => AuthPayload)
  async refreshSession(
    @Context('req') request: Request,
    @Context('res') response: Response,
  ): Promise<AuthPayload> {
    const refreshToken = this.readRefreshToken(request);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh session cookie is missing.');
    }
    return this.setSessionCookie(
      await this.authService.refreshSession(refreshToken),
      response,
    );
  }

  @Public()
  @Mutation(() => Boolean)
  async logout(
    @Context('req') request: Request,
    @Context('res') response: Response,
  ): Promise<boolean> {
    const refreshToken = this.readRefreshToken(request);
    if (refreshToken) await this.authService.logout(refreshToken);
    response.clearCookie(this.cookieName(), this.cookieOptions());
    return true;
  }

  private setSessionCookie(
    session: AuthSessionPayload,
    response: Response,
  ): AuthPayload {
    response.cookie(
      this.cookieName(),
      session.refreshToken,
      this.cookieOptions(true),
    );
    return { accessToken: session.accessToken, user: session.user };
  }

  private readRefreshToken(request: Request): string | null {
    const name = encodeURIComponent(this.cookieName());
    const match = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`));
    if (!match) return null;
    const value = match.slice(name.length + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  private cookieName(): string {
    return (
      this.configService.get<string>('REFRESH_COOKIE_NAME') ??
      'fretflow_refresh'
    );
  }

  private cookieOptions(withMaxAge = false): CookieOptions {
    const production =
      this.configService.get<string>('NODE_ENV') === 'production';
    const days = Number(
      this.configService.get<string>('REFRESH_TOKEN_TTL_DAYS') ?? 30,
    );
    return {
      httpOnly: true,
      secure: production,
      sameSite: production ? 'none' : 'lax',
      path: '/graphql',
      ...(withMaxAge ? { maxAge: days * 24 * 60 * 60 * 1000 } : {}),
    };
  }
}
