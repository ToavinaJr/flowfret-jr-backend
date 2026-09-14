import {
  Args,
  Context,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
  Query,
} from '@nestjs/graphql';
import { Int } from '@nestjs/graphql';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CommentModel,
  CreateCommentInput,
  PostModel,
  UpdateCommentInput,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { requireVisiblePost, visiblePostWhere } from '../common/post-access';

@Resolver(() => CommentModel)
export class CommentsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Query(() => [CommentModel], { name: 'comments' })
  async comments(
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<CommentModel[]> {
    return this.prisma.comment.findMany({
      where: {
        isDeleted: false,
        post: await visiblePostWhere(this.prisma, context.req.user.sub),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Query(() => CommentModel, { name: 'comment', nullable: true })
  async comment(
    @Args('id') id: string,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<CommentModel | null> {
    const comment = await this.prisma.comment.findFirst({
      where: { id, isDeleted: false },
    });
    if (comment)
      await requireVisiblePost(
        this.prisma,
        comment.postId,
        context.req.user.sub,
      );
    return comment;
  }

  @Query(() => [CommentModel], { name: 'commentsByPost' })
  async commentsByPost(
    @Args('postId') postId: string,
    @Args('skip', { type: () => Int, defaultValue: 0 }) skip: number,
    @Args('take', { type: () => Int, defaultValue: 20 }) take: number,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<CommentModel[]> {
    await requireVisiblePost(this.prisma, postId, context.req.user.sub);
    return this.prisma.comment.findMany({
      where: { postId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      skip: Math.max(0, skip),
      take: Math.min(50, Math.max(1, take)),
    });
  }

  @Mutation(() => CommentModel)
  async createComment(
    @Args('data') data: CreateCommentInput,
    @Context() context: { req: { user: { sub: string; username: string } } },
  ): Promise<CommentModel> {
    if (data.authorId !== context.req.user.sub)
      throw new ForbiddenException('Vous ne pouvez commenter qu’en votre nom.');
    const post = await requireVisiblePost(
      this.prisma,
      data.postId,
      context.req.user.sub,
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          postId: data.postId,
          authorId: context.req.user.sub,
          content: data.content.trim(),
          status: 'ACTIVE',
        },
      });

      await tx.post.update({
        where: { id: data.postId },
        data: {
          commentCount: {
            increment: 1,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: 'COMMENT_CREATED',
          entityType: 'comment',
          entityId: comment.id,
          metadata: { postId: data.postId },
        },
      });

      return comment;
    });
    await this.notifications.postCommented(
      context.req.user.sub,
      context.req.user.username,
      data.postId,
      created.id,
      post.authorId,
    );
    return created;
  }

  @Mutation(() => CommentModel)
  async updateComment(
    @Args('id') id: string,
    @Args('data') data: UpdateCommentInput,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<CommentModel> {
    const comment = await this.prisma.comment.findFirst({
      where: { id, isDeleted: false },
    });
    if (!comment) throw new NotFoundException('Commentaire introuvable.');
    if (comment.authorId !== context.req.user.sub)
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
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: 'COMMENT_UPDATED',
          entityType: 'comment',
          entityId: id,
          metadata: { postId: comment.postId },
        },
      });
      return updated;
    });
  }

  @Mutation(() => CommentModel)
  async deleteComment(
    @Args('id') id: string,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<CommentModel> {
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.findFirst({
        where: { id, isDeleted: false },
      });
      if (!comment) throw new NotFoundException('Commentaire introuvable.');
      if (comment.authorId !== context.req.user.sub)
        throw new ForbiddenException(
          'Seul le propriétaire peut supprimer ce commentaire.',
        );
      const deletedComment = await tx.comment.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date(), status: 'DELETED' },
      });

      await tx.post.updateMany({
        where: {
          id: deletedComment.postId,
          commentCount: {
            gt: 0,
          },
        },
        data: {
          commentCount: {
            decrement: 1,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: 'COMMENT_DELETED',
          entityType: 'comment',
          entityId: id,
          metadata: { postId: deletedComment.postId },
        },
      });

      return deletedComment;
    });
  }

  @ResolveField(() => PostModel, { name: 'post' })
  async post(@Parent() comment: CommentModel): Promise<PostModel | null> {
    return this.prisma.post.findUnique({ where: { id: comment.postId } });
  }

  @ResolveField(() => UserModel, { name: 'author' })
  async author(@Parent() comment: CommentModel): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: comment.authorId } });
  }
}
