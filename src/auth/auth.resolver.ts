import { UnauthorizedException } from '@nestjs/common';
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
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { RateLimit, RateLimits } from './rate-limit.decorator';
import {
  cookieName,
  cookieOptions,
  readRefreshToken,
  writeSessionCookie,
} from './auth-cookie.utils';
import { assertRefreshOrigin } from './refresh-origin';

@Resolver()
export class AuthResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @RateLimits(
    { limit: 5, windowSeconds: 60, failClosed: true },
    { limit: 20, windowSeconds: 3600, failClosed: true },
  )
  @Mutation(() => AuthPayload)
  async register(
    @Args('data') data: RegisterInput,
    @Context('res') response: Response,
  ): Promise<AuthPayload> {
    return writeSessionCookie(
      response,
      this.configService,
      await this.authService.register(data),
    );
  }

  @Public()
  @RateLimit(10, 900, true)
  @Mutation(() => AuthPayload)
  async login(
    @Args('data') data: LoginInput,
    @Context('res') response: Response,
  ): Promise<AuthPayload> {
    return writeSessionCookie(
      response,
      this.configService,
      await this.authService.login(data),
    );
  }

  @Public()
  @RateLimit(20, 900, true)
  @Mutation(() => AuthPayload)
  async loginWithGoogle(
    @Args('data') data: GoogleAuthInput,
    @Context('res') response: Response,
  ): Promise<AuthPayload> {
    return writeSessionCookie(
      response,
      this.configService,
      await this.authService.loginWithGoogle(data),
    );
  }

  @Public()
  @RateLimit(10, 3600, true)
  @Mutation(() => AuthPayload)
  async registerWithGoogle(
    @Args('data') data: GoogleAuthInput,
    @Context('res') response: Response,
  ): Promise<AuthPayload> {
    return writeSessionCookie(
      response,
      this.configService,
      await this.authService.registerWithGoogle(data),
    );
  }

  @Public()
  @RateLimit(10, 900, true)
  @Mutation(() => AuthPayload)
  async verifyEmail(
    @Args('data') data: VerifyEmailInput,
    @Context('res') response: Response,
  ): Promise<AuthPayload> {
    return writeSessionCookie(
      response,
      this.configService,
      await this.authService.verifyEmail(data),
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
    assertRefreshOrigin(request, this.configService);
    const refreshToken = readRefreshToken(
      request,
      cookieName(this.configService),
    );
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh session cookie is missing.');
    }
    return writeSessionCookie(
      response,
      this.configService,
      await this.authService.refreshSession(refreshToken),
    );
  }

  @Public()
  @Mutation(() => Boolean)
  async logout(
    @Context('req') request: Request,
    @Context('res') response: Response,
  ): Promise<boolean> {
    assertRefreshOrigin(request, this.configService);
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
}
