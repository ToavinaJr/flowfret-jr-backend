import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Context, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import {
  AuditLogModel,
  CommentModel,
  FriendshipModel,
  NotificationModel,
  PostLikeModel,
  PostReportModel,
  UploadModel,
  UserModel,
} from '../graphql/graphql.types';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

type RequestContext = { req: { user: { sub: string } } };

@Resolver(() => UserModel)
export class UserRelationsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @ResolveField(() => [CommentModel], { name: 'comments' })
  comments(@Parent() user: UserModel, @Context() context: RequestContext) {
    this.requireSelf(user.id, context.req.user.sub);
    return this.prisma.comment.findMany({
      where: { authorId: user.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [UploadModel], { name: 'uploads' })
  async uploads(@Parent() user: UserModel, @Context() context: RequestContext) {
    this.requireSelf(user.id, context.req.user.sub);
    const uploads = await this.prisma.upload.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    return uploads.map((upload) => ({
      ...upload,
      fileSize: upload.fileSize.toString(),
    }));
  }

  @ResolveField(() => [NotificationModel], { name: 'notifications' })
  notifications(@Parent() user: UserModel, @Context() context: RequestContext) {
    this.requireSelf(user.id, context.req.user.sub);
    return this.prisma.notification.findMany({
      where: { userId: user.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [AuditLogModel], { name: 'auditLogs' })
  auditLogs(@Parent() user: UserModel, @Context() context: RequestContext) {
    this.requireSelf(user.id, context.req.user.sub);
    return this.prisma.auditLog.findMany({
      where: { actorId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [FriendshipModel], { name: 'friendshipsRequested' })
  friendshipsRequested(
    @Parent() user: UserModel,
    @Context() context: RequestContext,
  ) {
    this.requireSelf(user.id, context.req.user.sub);
    return this.prisma.friendship.findMany({
      where: { requesterId: user.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [FriendshipModel], { name: 'friendshipsReceived' })
  friendshipsReceived(
    @Parent() user: UserModel,
    @Context() context: RequestContext,
  ) {
    this.requireSelf(user.id, context.req.user.sub);
    return this.prisma.friendship.findMany({
      where: { receiverId: user.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [PostLikeModel], { name: 'likes' })
  likes(@Parent() user: UserModel, @Context() context: RequestContext) {
    this.requireSelf(user.id, context.req.user.sub);
    return this.prisma.postLike.findMany({
      where: { userId: user.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [PostReportModel], { name: 'reports' })
  @Roles(UserRole.ADMIN)
  reports(@Parent() user: UserModel) {
    return this.prisma.postReport.findMany({
      where: { reporterId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  private requireSelf(userId: string, actorId: string): void {
    if (userId !== actorId) throw new ForbiddenException('Action interdite.');
  }
}
