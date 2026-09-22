import {
  Args,
  Context,
  Mutation,
  Parent,
  ResolveField,
  Query,
  Resolver,
} from '@nestjs/graphql';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CreatePostAttachmentInput,
  CreatePostLikeInput,
  CreatePostReportInput,
  PostAttachmentModel,
  PostLikeModel,
  PostReportModel,
  UpdatePostAttachmentInput,
  UpdatePostLikeInput,
  UpdatePostReportInput,
  PostModel,
  UploadModel,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Prisma, UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { requireVisiblePost, visiblePostWhere } from '../common/post-access';

@Resolver(() => PostLikeModel)
export class PostInteractionsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Query(() => [PostLikeModel], { name: 'postLikes' })
  async postLikes(
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<PostLikeModel[]> {
    return this.prisma.postLike.findMany({
      where: {
        isDeleted: false,
        post: await visiblePostWhere(this.prisma, context.req.user.sub),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Query(() => PostLikeModel, { name: 'postLike', nullable: true })
  async postLike(
    @Args('id') id: string,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<PostLikeModel | null> {
    const like = await this.prisma.postLike.findFirst({
      where: { id, isDeleted: false },
    });
    if (like)
      await requireVisiblePost(this.prisma, like.postId, context.req.user.sub);
    return like;
  }

  @Query(() => [PostReportModel], { name: 'postReports' })
  @Roles(UserRole.ADMIN)
  async postReports(): Promise<PostReportModel[]> {
    return this.prisma.postReport.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Query(() => PostReportModel, { name: 'postReport', nullable: true })
  @Roles(UserRole.ADMIN)
  async postReport(@Args('id') id: string): Promise<PostReportModel | null> {
    return this.prisma.postReport.findFirst({
      where: { id, isDeleted: false },
    });
  }

  @Query(() => [PostAttachmentModel], { name: 'postAttachments' })
  @Roles(UserRole.ADMIN)
  async postAttachments(): Promise<PostAttachmentModel[]> {
    return this.prisma.postAttachment.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  @Query(() => PostAttachmentModel, { name: 'postAttachment', nullable: true })
  @Roles(UserRole.ADMIN)
  async postAttachment(
    @Args('id') id: string,
  ): Promise<PostAttachmentModel | null> {
    return this.prisma.postAttachment.findFirst({
      where: { id, isDeleted: false },
    });
  }

  @Mutation(() => PostLikeModel)
  async createPostLike(
    @Args('data') data: CreatePostLikeInput,
    @Context() context: { req: { user: { sub: string; username: string } } },
  ): Promise<PostLikeModel> {
    if (data.userId !== context.req.user.sub)
      throw new ForbiddenException('Action interdite.');
    await requireVisiblePost(this.prisma, data.postId, context.req.user.sub);
    const result = await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findFirst({
        where: { id: data.postId, isDeleted: false },
      });
      if (!post) throw new NotFoundException('Publication introuvable.');
      const previous = await tx.postLike.findUnique({
        where: {
          postId_userId: { postId: data.postId, userId: context.req.user.sub },
        },
      });
      if (previous && !previous.isDeleted)
        return { like: previous, shouldNotify: false };
      const like = previous
        ? await tx.postLike.update({
            where: { id: previous.id },
            data: { isDeleted: false, deletedAt: null },
          })
        : await tx.postLike.create({
            data: { postId: data.postId, userId: context.req.user.sub },
          });
      await tx.post.update({
        where: { id: data.postId },
        data: { likeCount: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: 'POST_LIKED',
          entityType: 'post',
          entityId: data.postId,
          metadata: { likeId: like.id },
        },
      });
      return { like, shouldNotify: true };
    });
    const post = await this.prisma.post.findUnique({
      where: { id: data.postId },
      select: { authorId: true },
    });
    if (post && result.shouldNotify)
      await this.notifications.postLiked(
        context.req.user.sub,
        context.req.user.username,
        data.postId,
        post.authorId,
      );
    return result.like;
  }

  @Mutation(() => PostLikeModel)
  @Roles(UserRole.ADMIN)
  async updatePostLike(
    @Args('id') id: string,
    @Args('data') data: UpdatePostLikeInput,
  ): Promise<PostLikeModel> {
    return this.prisma.postLike.update({ where: { id }, data });
  }

  @Mutation(() => PostLikeModel)
  async deletePostLike(
    @Args('id') id: string,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<PostLikeModel> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.postLike.findFirst({
        where: { id, isDeleted: false },
      });
      if (!existing) throw new NotFoundException('Like introuvable.');
      if (existing.userId !== context.req.user.sub)
        throw new ForbiddenException('Action interdite.');
      const like = await tx.postLike.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      await tx.post.updateMany({
        where: { id: existing.postId, likeCount: { gt: 0 } },
        data: { likeCount: { decrement: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: 'POST_UNLIKED',
          entityType: 'post',
          entityId: existing.postId,
          metadata: { likeId: id },
        },
      });
      return like;
    });
  }

  @Mutation(() => PostReportModel)
  async createPostReport(
    @Args('data') data: CreatePostReportInput,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<PostReportModel> {
    if (data.reporterId !== context.req.user.sub) {
      throw new ForbiddenException('Action interdite.');
    }
    await requireVisiblePost(this.prisma, data.postId, context.req.user.sub);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const report = await tx.postReport.create({
          data: {
            postId: data.postId,
            reporterId: context.req.user.sub,
            reason: data.reason,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: context.req.user.sub,
            action: 'POST_REPORTED',
            entityType: 'post',
            entityId: data.postId,
            metadata: { reportId: report.id },
          },
        });
        return report;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Cette publication est déjà signalée.');
      throw error;
    }
  }

  @Mutation(() => PostReportModel)
  @Roles(UserRole.ADMIN)
  async updatePostReport(
    @Args('id') id: string,
    @Args('data') data: UpdatePostReportInput,
  ): Promise<PostReportModel> {
    return this.prisma.postReport.update({ where: { id }, data });
  }

  @Mutation(() => PostReportModel)
  @Roles(UserRole.ADMIN)
  async deletePostReport(@Args('id') id: string): Promise<PostReportModel> {
    return this.prisma.postReport.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  @Mutation(() => PostAttachmentModel)
  @Roles(UserRole.ADMIN)
  async createPostAttachment(
    @Args('data') data: CreatePostAttachmentInput,
  ): Promise<PostAttachmentModel> {
    return this.prisma.postAttachment.create({ data });
  }

  @Mutation(() => PostAttachmentModel)
  @Roles(UserRole.ADMIN)
  async updatePostAttachment(
    @Args('id') id: string,
    @Args('data') data: UpdatePostAttachmentInput,
  ): Promise<PostAttachmentModel> {
    return this.prisma.postAttachment.update({ where: { id }, data });
  }

  @Mutation(() => PostAttachmentModel)
  @Roles(UserRole.ADMIN)
  async deletePostAttachment(
    @Args('id') id: string,
  ): Promise<PostAttachmentModel> {
    return this.prisma.postAttachment.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  @ResolveField(() => PostModel, { name: 'post' })
  async post(@Parent() row: PostLikeModel): Promise<PostModel | null> {
    return this.prisma.post.findUnique({ where: { id: row.postId } });
  }

  @ResolveField(() => UserModel, { name: 'user', nullable: true })
  async user(@Parent() row: PostLikeModel): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: row.userId } });
  }
}

@Resolver(() => PostReportModel)
export class PostReportsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @ResolveField(() => PostModel, { name: 'post' })
  async post(@Parent() row: PostReportModel): Promise<PostModel | null> {
    return this.prisma.post.findUnique({ where: { id: row.postId } });
  }

  @ResolveField(() => UserModel, { name: 'reporter' })
  async reporter(@Parent() row: PostReportModel): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: row.reporterId } });
  }
}

@Resolver(() => PostAttachmentModel)
export class PostAttachmentsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @ResolveField(() => PostModel, { name: 'post' })
  async post(@Parent() row: PostAttachmentModel): Promise<PostModel | null> {
    return this.prisma.post.findUnique({ where: { id: row.postId } });
  }

  @ResolveField(() => UploadModel, { name: 'upload' })
  async upload(
    @Parent() row: PostAttachmentModel,
  ): Promise<UploadModel | null> {
    const upload = await this.prisma.upload.findUnique({
      where: { id: row.uploadId },
    });

    if (!upload) {
      return null;
    }

    return {
      ...upload,
      fileSize: upload.fileSize.toString(),
    };
  }
}
