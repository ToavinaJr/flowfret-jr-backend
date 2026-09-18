import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import type { Request, Response } from 'express';
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
import { RateLimit, RateLimits } from './rate-limit.decorator';
import {
  cookieName,
  cookieOptions,
  readRefreshToken,
} from './auth-cookie.utils';

@Resolver()
export class AuthResolver {
  private readonly logger = new Logger(AuthResolver.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @RateLimits(
    { limit: 5, windowSeconds: 60, failClosed: true },
    { limit: 20, windowSeconds: 3600, failClosed: true },
  )
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
            errorName: error instanceof Error ? error.name : 'UnknownError',
            errorCode:
              error && typeof error === 'object' && 'code' in error
                ? String((error as { code?: unknown }).code)
                : undefined,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          }),
          undefined,
        );
      }
      throw error;
    }
  }

  @Public()
  @RateLimit(10, 900, true)
  @Mutation(() => AuthPayload)
  async login(
    @Args('data') data: LoginInput,
    @Context('res') response: Response,
  ): Promise<AuthPayload> {
    return this.setSessionCookie(await this.authService.login(data), response);
  }

  @Public()
  @RateLimit(20, 900, true)
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
  @RateLimit(10, 3600, true)
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
  @RateLimit(10, 900, true)
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
  @RateLimit(3, 3600, true)
  @Mutation(() => RegisterPendingPayload)
  async resendVerificationEmail(
    @Args('token') token: string,
  ): Promise<RegisterPendingPayload> {
    return this.authService.resendVerificationEmail(token);
  }

  @Public()
  @RateLimit(3, 3600, true)
  @Mutation(() => Boolean)
  async requestPasswordReset(
    @Args('data') data: RequestPasswordResetInput,
  ): Promise<boolean> {
    await this.authService.requestPasswordReset(data.email);
    return true;
  }

  @Public()
  @RateLimit(5, 3600, true)
  @Mutation(() => Boolean)
  async resetPassword(
    @Args('data') data: ResetPasswordInput,
  ): Promise<boolean> {
    await this.authService.resetPassword(data.token, data.password);
    return true;
  }

  @Public()
  @RateLimit(60, 900, true)
  @Mutation(() => AuthPayload)
  async refreshSession(
    @Context('req') request: Request,
    @Context('res') response: Response,
  ): Promise<AuthPayload> {
    const refreshToken = readRefreshToken(
      request,
      cookieName(this.configService),
    );
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
    const refreshToken = readRefreshToken(
      request,
      cookieName(this.configService),
    );
    if (refreshToken) await this.authService.logout(refreshToken);
    response.clearCookie(
      cookieName(this.configService),
      cookieOptions(this.configService),
    );
    return true;
  }

  private setSessionCookie(
    session: AuthSessionPayload,
    response: Response,
  ): AuthPayload {
    response.cookie(
      cookieName(this.configService),
      session.refreshToken,
      cookieOptions(this.configService, true),
    );
    return { accessToken: session.accessToken, user: session.user };
  }
}
