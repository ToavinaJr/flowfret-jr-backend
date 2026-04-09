import { Args, Mutation, Resolver } from '@nestjs/graphql';
import {
  AuthPayload,
  LoginInput,
  RegisterInput,
} from '../graphql/graphql.types';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Mutation(() => AuthPayload)
  async register(@Args('data') data: RegisterInput): Promise<AuthPayload> {
    return this.authService.register(data);
  }

  @Public()
  @Mutation(() => AuthPayload)
  async login(@Args('data') data: LoginInput): Promise<AuthPayload> {
    return this.authService.login(data);
  }
}
