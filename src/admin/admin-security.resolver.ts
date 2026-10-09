import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { UserRole } from '@prisma/client';
import { RateLimit } from '../auth/rate-limit.decorator';
import { Roles } from '../auth/roles.decorator';
import {
  AdminSetUserRoleInput,
  AdminSetUserStatusInput,
  AdminUserActionInput,
  AdminUserSecurityResult,
} from './admin.types';
import { AdminSecurityService } from './admin-security.service';

type AdminRequestContext = { req: { user: { sub: string } } };

@RateLimit(120, 60, true)
@Roles(UserRole.ADMIN)
@Resolver()
export class AdminSecurityResolver {
  constructor(private readonly security: AdminSecurityService) {}

  @RateLimit(30, 60, true)
  @Mutation(() => AdminUserSecurityResult, { name: 'adminSetUserRole' })
  setUserRole(
    @Args('input') input: AdminSetUserRoleInput,
    @Context() context: AdminRequestContext,
  ): Promise<AdminUserSecurityResult> {
    return this.security.setRole(
      context.req.user.sub,
      input.userId,
      input.role,
      input.reason,
    );
  }

  @RateLimit(30, 60, true)
  @Mutation(() => AdminUserSecurityResult, { name: 'adminSetUserStatus' })
  setUserStatus(
    @Args('input') input: AdminSetUserStatusInput,
    @Context() context: AdminRequestContext,
  ): Promise<AdminUserSecurityResult> {
    return this.security.setStatus(
      context.req.user.sub,
      input.userId,
      input.status,
      input.reason,
    );
  }

  @RateLimit(10, 60, true)
  @Mutation(() => AdminUserSecurityResult, { name: 'adminDeleteUser' })
  deleteUser(
    @Args('input') input: AdminUserActionInput,
    @Context() context: AdminRequestContext,
  ): Promise<AdminUserSecurityResult> {
    return this.security.deleteUser(
      context.req.user.sub,
      input.userId,
      input.reason,
    );
  }

  @RateLimit(30, 60, true)
  @Mutation(() => AdminUserSecurityResult, {
    name: 'adminRevokeUserSessions',
  })
  revokeUserSessions(
    @Args('input') input: AdminUserActionInput,
    @Context() context: AdminRequestContext,
  ): Promise<AdminUserSecurityResult> {
    return this.security.revokeSessions(
      context.req.user.sub,
      input.userId,
      input.reason,
    );
  }
}
