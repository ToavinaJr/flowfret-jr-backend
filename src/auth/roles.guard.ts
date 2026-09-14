import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

type AuthenticatedRequest = {
  user?: { role?: UserRole };
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) return true;

    const request =
      context.getType<string>() === 'http'
        ? context.switchToHttp().getRequest<AuthenticatedRequest>()
        : GqlExecutionContext.create(context).getContext<{
            req: AuthenticatedRequest;
          }>().req;

    return Boolean(
      request.user?.role && requiredRoles.includes(request.user.role),
    );
  }
}
