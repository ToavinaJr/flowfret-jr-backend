import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { concatMap, from, map, Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

/** Safety net that records every successful authenticated GraphQL mutation. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly transactionallyAudited = new Set([
    'createPost',
    'updatePost',
    'deletePost',
    'createComment',
    'updateComment',
    'deleteComment',
    'createPostLike',
    'deletePostLike',
    'createPostReport',
    'sendFriendRequest',
    'respondFriendRequest',
    'removeFriend',
    'createProfile',
    'updateProfile',
    'deleteProfile',
    'deleteUpload',
    'recordActivity',
    'adminSetUserRole',
    'adminSetUserStatus',
    'adminDeleteUser',
    'adminRevokeUserSessions',
    'adminModeratePostReport',
    'updatePostReport',
  ]);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<string>() !== 'graphql') return next.handle();
    const gql = GqlExecutionContext.create(context);
    const info = gql.getInfo<{
      operation: { operation: string };
      fieldName: string;
    }>();
    const actorId = gql.getContext<{ req?: { user?: { sub?: string } } }>().req
      ?.user?.sub;
    if (
      info.operation.operation !== 'mutation' ||
      !actorId ||
      this.transactionallyAudited.has(info.fieldName)
    )
      return next.handle();
    const args = gql.getArgs<{ id?: string }>();
    const entityId =
      typeof args.id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(args.id)
        ? args.id
        : undefined;
    return next.handle().pipe(
      concatMap((value: unknown) =>
        from(
          this.prisma.auditLog.create({
            data: {
              actorId,
              action: `MUTATION_${info.fieldName.toUpperCase()}`.slice(0, 100),
              entityType: info.fieldName.slice(0, 100),
              entityId,
              metadata: {},
            },
          }),
        ).pipe(map((): unknown => value)),
      ),
    );
  }
}
