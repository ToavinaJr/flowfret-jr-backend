import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommentModel,
  CreateCommentInput,
  UpdateCommentInput,
} from '../graphql/graphql.types';
import { syncCommentMentions } from '../common/mentions';
import { requireVisiblePost } from '../common/post-access';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CommentActor {
  sub: string;
  username?: string;
}

@Injectable()
export class CommentsCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    data: CreateCommentInput,
    actor: CommentActor,
  ): Promise<CommentModel> {
    if (data.authorId !== actor.sub)
      throw new ForbiddenException('Vous ne pouvez commenter qu’en votre nom.');
    const post = await requireVisiblePost(this.prisma, data.postId, actor.sub);
    const created = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          postId: data.postId,
          authorId: actor.sub,
          content: data.content.trim(),
          status: 'ACTIVE',
        },
      });
      await syncCommentMentions(tx, comment.id, actor.sub, comment.content);
      await tx.post.update({
        where: { id: data.postId },
        data: { commentCount: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'COMMENT_CREATED',
          entityType: 'comment',
          entityId: comment.id,
          metadata: { postId: data.postId },
        },
      });
      return comment;
    });
    await this.notifications.postCommented(
      actor.sub,
      actor.username ?? '',
      data.postId,
      created.id,
      post.authorId,
    );
    return created;
  }

  async update(
    id: string,
    data: UpdateCommentInput,
    actorId: string,
  ): Promise<CommentModel> {
    const comment = await this.prisma.comment.findFirst({
      where: { id, isDeleted: false },
    });
    if (!comment) throw new NotFoundException('Commentaire introuvable.');
    if (comment.authorId !== actorId)
      throw new ForbiddenException(
        'Seul le propriétaire peut modifier ce commentaire.',
      );
    const safeData = { ...data };
    delete safeData.authorId;
    delete safeData.postId;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.comment.update({
        where: { id },
        data: safeData,
      });
      if (safeData.content !== undefined)
        await syncCommentMentions(tx, id, actorId, safeData.content);
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'COMMENT_UPDATED',
          entityType: 'comment',
          entityId: id,
          metadata: { postId: comment.postId },
        },
      });
      return updated;
    });
  }

  delete(id: string, actorId: string): Promise<CommentModel> {
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.findFirst({
        where: { id, isDeleted: false },
      });
      if (!comment) throw new NotFoundException('Commentaire introuvable.');
      if (comment.authorId !== actorId)
        throw new ForbiddenException(
          'Seul le propriétaire peut supprimer ce commentaire.',
        );
      const deleted = await tx.comment.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date(), status: 'DELETED' },
      });
      await tx.commentMention.updateMany({
        where: { commentId: id, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      await tx.post.updateMany({
        where: { id: deleted.postId, commentCount: { gt: 0 } },
        data: { commentCount: { decrement: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'COMMENT_DELETED',
          entityType: 'comment',
          entityId: id,
          metadata: { postId: deleted.postId },
        },
      });
      return deleted;
    });
  }
}
