import { Args, Mutation, Resolver } from '@nestjs/graphql';
import {
  AuthPayload,
  GoogleAuthInput,
  LoginInput,
  RegisterInput,
  RegisterPendingPayload,
  VerifyEmailInput,
} from '../graphql/graphql.types';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Mutation(() => RegisterPendingPayload)
  async register(
    @Args('data') data: RegisterInput,
  ): Promise<RegisterPendingPayload> {
    return this.authService.register(data);
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
}
