import { Logger } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
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
import { errorDetails, isDebugEnabled } from '../common/debug';

@Resolver()
export class AuthResolver {
  private readonly logger = new Logger(AuthResolver.name);

  constructor(private readonly authService: AuthService) {}

  @Public()
  @Mutation(() => RegisterPendingPayload)
  async register(
    @Args('data') data: RegisterInput,
  ): Promise<RegisterPendingPayload> {
    const startedAt = Date.now();
    const details = { email: data.email, username: data.username };
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
          errorDetails(error),
        );
      }
      throw error;
    }
  }

  @Public()
  @Mutation(() => AuthPayload)
  async login(@Args('data') data: LoginInput): Promise<AuthPayload> {
    return this.authService.login(data);
  }

  @Public()
  @Mutation(() => AuthPayload)
  async loginWithGoogle(
    @Args('data') data: GoogleAuthInput,
  ): Promise<AuthPayload> {
    return this.authService.loginWithGoogle(data);
  }

  @Public()
  @Mutation(() => AuthPayload)
  async verifyEmail(
    @Args('data') data: VerifyEmailInput,
  ): Promise<AuthPayload> {
    return this.authService.verifyEmail(data);
  }

  @Public()
  @Mutation(() => RegisterPendingPayload)
  async resendVerificationEmail(
    @Args('token') token: string,
  ): Promise<RegisterPendingPayload> {
    return this.authService.resendVerificationEmail(token);
  }

  @Public()
  @Mutation(() => Boolean)
  async requestPasswordReset(
    @Args('data') data: RequestPasswordResetInput,
  ): Promise<boolean> {
    await this.authService.requestPasswordReset(data.email);
    return true;
  }

  @Public()
  @Mutation(() => Boolean)
  async resetPassword(
    @Args('data') data: ResetPasswordInput,
  ): Promise<boolean> {
    await this.authService.resetPassword(data.token, data.password);
    return true;
  }
}
