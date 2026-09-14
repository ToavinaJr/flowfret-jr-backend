import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';
import { IS_PUBLIC_KEY } from './public.decorator';

type AuthRequest = { headers?: Record<string, unknown>; user?: unknown };

@Injectable()
export class GqlJwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Public operations opt out explicitly. Every other query and mutation
    // must populate req.user so resolvers never trust a client-provided id.
    return super.canActivate(context);
  }

  getRequest(context: ExecutionContext): AuthRequest {
    if (context.getType<string>() === 'http') {
      return context.switchToHttp().getRequest<AuthRequest>();
    }
    return GqlExecutionContext.create(context).getContext<{
      req: AuthRequest;
    }>().req;
  }
}
