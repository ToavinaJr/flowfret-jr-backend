import { Injectable, NotFoundException } from '@nestjs/common';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { PostLikeModel } from '../graphql/graphql.types';
import { requireVisiblePost } from '../common/post-access';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

export interface LikeActor {
  sub: string;
  username?: string;
}

@Injectable()
export class PostLikesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(postId: string, actor: LikeActor): Promise<PostLikeModel> {
    await requireVisiblePost(this.prisma, postId, actor.sub);
    const result = await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findFirst({
        where: { id: postId, isDeleted: false },
      });
      if (!post) throw new NotFoundException('Publication introuvable.');
      const previous = await tx.postLike.findUnique({
        where: { postId_userId: { postId, userId: actor.sub } },
      });
      if (previous && !previous.isDeleted)
        return { like: previous, shouldNotify: false };
      const like = previous
        ? await tx.postLike.update({
            where: { id: previous.id },
            data: { isDeleted: false, deletedAt: null },
          })
        : await tx.postLike.create({ data: { postId, userId: actor.sub } });
      await tx.post.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: AUDIT_ACTION.POST_LIKED,
          entityType: AUDIT_ENTITY.POST,
          entityId: postId,
          metadata: { likeId: like.id },
        },
      });
      return { like, shouldNotify: true };
    });
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });
    if (post && result.shouldNotify)
      await this.notifications.postLiked(
        actor.sub,
        actor.username ?? '',
        postId,
        post.authorId,
      );
    return result.like;
  }

  unlike(postId: string, actorId: string): Promise<PostLikeModel> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.postLike.findFirst({
        where: { postId, userId: actorId, isDeleted: false },
      });
      if (!existing) throw new NotFoundException('Like introuvable.');
      const like = await tx.postLike.update({
        where: { id: existing.id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      await tx.post.updateMany({
        where: { id: existing.postId, likeCount: { gt: 0 } },
        data: { likeCount: { decrement: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: AUDIT_ACTION.POST_UNLIKED,
          entityType: AUDIT_ENTITY.POST,
          entityId: existing.postId,
          metadata: { likeId: existing.id },
        },
      });
      return like;
    });
  }
}
