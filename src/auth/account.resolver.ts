import { ConfigService } from '@nestjs/config';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Request, Response } from 'express';
import {
  AuthSessionModel,
  ChangePasswordInput,
  DeleteAccountInput,
} from '../graphql/graphql.types';
import { AuthAccountService } from './auth-account.service';
import {
  cookieName,
  cookieOptions,
  readRefreshToken,
} from './auth-cookie.utils';
import { RateLimit } from './rate-limit.decorator';
import { assertRefreshOrigin } from './refresh-origin';

type AccountRequest = Request & { user: { sub: string } };

@Resolver()
export class AccountResolver {
  constructor(
    private readonly accounts: AuthAccountService,
    private readonly config: ConfigService,
  ) {}

  @Query(() => [AuthSessionModel])
  mySessions(
    @Context('req') request: AccountRequest,
  ): Promise<AuthSessionModel[]> {
    return this.accounts.sessions(
      request.user.sub,
      readRefreshToken(request, cookieName(this.config)),
    );
  }

  @RateLimit(20, 60, true)
  @Mutation(() => Boolean)
  revokeSession(
    @Args('id') id: string,
    @Context('req') request: AccountRequest,
  ): Promise<boolean> {
    assertRefreshOrigin(request, this.config);
    return this.accounts.revokeSession(id, request.user.sub);
  }

  @RateLimit(5, 3600, true)
  @Mutation(() => Boolean)
  changePassword(
    @Args('data') data: ChangePasswordInput,
    @Context('req') request: AccountRequest,
  ): Promise<boolean> {
    assertRefreshOrigin(request, this.config);
    return this.accounts.changePassword(
      request.user.sub,
      data.currentPassword,
      data.newPassword,
    );
  }

  @RateLimit(3, 3600, true)
  @Mutation(() => Boolean)
  async deleteMyAccount(
    @Args('data') data: DeleteAccountInput,
    @Context('req') request: AccountRequest,
    @Context('res') response: Response,
  ): Promise<boolean> {
    assertRefreshOrigin(request, this.config);
    await this.accounts.deleteAccount(
      request.user.sub,
      data.currentPassword,
      data.confirmation,
    );
    response.clearCookie(cookieName(this.config), cookieOptions(this.config));
    return true;
  }
}
