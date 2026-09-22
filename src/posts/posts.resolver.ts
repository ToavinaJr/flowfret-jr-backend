import {
  Args,
  Context,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
  Query,
} from '@nestjs/graphql';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CommentModel,
  CreatePostInput,
  PostAttachmentModel,
  PostLikeModel,
  PostModel,
  PostReportModel,
  PostTagModel,
  UpdatePostInput,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { requireVisiblePost, visiblePostWhere } from '../common/post-access';
import { UploadCleanupService } from '../uploads/upload-cleanup.service';

@Resolver(() => PostModel)
export class PostsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly uploadCleanup: UploadCleanupService,
  ) {}

  @Query(() => [PostModel], { name: 'posts' })
  async posts(
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<PostModel[]> {
    return this.prisma.post.findMany({
      where: await visiblePostWhere(this.prisma, context.req.user.sub),
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Query(() => PostModel, { name: 'post', nullable: true })
  async post(
    @Args('id') id: string,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<PostModel | null> {
    return requireVisiblePost(this.prisma, id, context.req.user.sub);
  }

  @Mutation(() => PostModel)
  async createPost(
    @Args('data') data: CreatePostInput,
    @Context() context: { req: { user: { sub: string; username: string } } },
  ): Promise<PostModel> {
    if (data.authorId !== context.req.user.sub)
      throw new ForbiddenException('Vous ne pouvez publier qu’en votre nom.');
    const content = data.content?.trim() || null;
    const imageUploadIds = data.imageUploadIds ?? [];
    if (!content && imageUploadIds.length === 0)
      throw new BadRequestException('Ajoutez un texte ou au moins une image.');
    const uploads = imageUploadIds.length
      ? await this.prisma.upload.findMany({
          where: {
            id: { in: imageUploadIds },
            userId: context.req.user.sub,
            isDeleted: false,
            fileType: { startsWith: 'image/' },
          },
        })
      : [];
    if (uploads.length !== imageUploadIds.length)
      throw new BadRequestException('Une ou plusieurs images sont invalides.');
    const post = await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          content,
          coverImageUrl: data.coverImageUrl,
          audioUrl: data.audioUrl,
          visibility: data.visibility,
          authorId: context.req.user.sub,
          status: 'ACTIVE',
          attachments: imageUploadIds.length
            ? {
                create: imageUploadIds.map((uploadId, position) => ({
                  uploadId,
                  position,
                  kind: 'IMAGE',
                })),
              }
            : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: 'POST_CREATED',
          entityType: 'post',
          entityId: post.id,
          metadata: { imageCount: imageUploadIds.length },
        },
      });
      return post;
    });
    if (post.visibility !== 'PRIVATE') {
      await this.notifications.friendPosted(
        context.req.user.sub,
        context.req.user.username,
        post.id,
      );
    }
    return post;
  }

  @Mutation(() => PostModel)
  async updatePost(
    @Args('id') id: string,
    @Args('data') data: UpdatePostInput,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<PostModel> {
    const post = await this.prisma.post.findFirst({
      where: { id, isDeleted: false },
    });
    if (!post) throw new NotFoundException('Publication introuvable.');
    if (post.authorId !== context.req.user.sub)
      throw new ForbiddenException(
        'Seul le propriétaire peut modifier cette publication.',
      );
    const safeData = { ...data };
    delete safeData.authorId;
    delete safeData.imageUploadIds;
    delete safeData.status;
    if (safeData.content !== undefined && !safeData.content?.trim()) {
      const imageCount = await this.prisma.postAttachment.count({
        where: { postId: id, kind: 'IMAGE', isDeleted: false },
      });
      if (imageCount === 0)
        throw new BadRequestException(
          'Une publication doit contenir du texte ou une image.',
        );
      safeData.content = null;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.post.update({ where: { id }, data: safeData });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: 'POST_UPDATED',
          entityType: 'post',
          entityId: id,
          metadata: {},
        },
      });
      return updated;
    });
  }

  @Mutation(() => PostModel)
  async deletePost(
    @Args('id') id: string,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<PostModel> {
    const post = await this.prisma.post.findFirst({
      where: { id, isDeleted: false },
    });
    if (!post) throw new NotFoundException('Publication introuvable.');
    if (post.authorId !== context.req.user.sub)
      throw new ForbiddenException(
        'Seul le propriétaire peut supprimer cette publication.',
      );
    const result = await this.prisma.$transaction(async (tx) => {
      const attachments = await tx.postAttachment.findMany({
        where: { postId: id, isDeleted: false },
        select: { uploadId: true },
      });
      const deleted = await tx.post.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date(), status: 'DELETED' },
      });
      await tx.postAttachment.updateMany({
        where: { postId: id, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      const uploadIds: string[] = [];
      for (const { uploadId } of attachments) {
        const remainingReferences = await tx.postAttachment.count({
          where: { uploadId, isDeleted: false },
        });
        if (remainingReferences === 0) {
          await tx.upload.updateMany({
            where: { id: uploadId, isDeleted: false },
            data: {
              isDeleted: true,
              deletedAt: new Date(),
              status: 'DELETED',
              cleanupPending: true,
            },
          });
          uploadIds.push(uploadId);
        }
      }
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: 'POST_DELETED',
          entityType: 'post',
          entityId: id,
          metadata: {},
        },
      });
      return { deleted, uploadIds };
    });
    await this.uploadCleanup.processPending(result.uploadIds);
    return result.deleted;
  }

  @ResolveField(() => UserModel, { name: 'author' })
  async author(@Parent() post: PostModel): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: post.authorId } });
  }

  @ResolveField(() => [CommentModel], { name: 'comments' })
  async comments(@Parent() post: PostModel): Promise<CommentModel[]> {
    return this.prisma.comment.findMany({
      where: { postId: post.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [PostLikeModel], { name: 'likes' })
  async likes(@Parent() post: PostModel): Promise<PostLikeModel[]> {
    return this.prisma.postLike.findMany({
      where: { postId: post.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [PostReportModel], { name: 'reports' })
  @Roles(UserRole.ADMIN)
  async reports(@Parent() post: PostModel): Promise<PostReportModel[]> {
    return this.prisma.postReport.findMany({
      where: { postId: post.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [PostAttachmentModel], { name: 'attachments' })
  async attachments(@Parent() post: PostModel): Promise<PostAttachmentModel[]> {
    return this.prisma.postAttachment.findMany({
      where: { postId: post.id, isDeleted: false },
      orderBy: { position: 'asc' },
    });
  }

  @ResolveField(() => [PostTagModel], { name: 'tags' })
  async tags(@Parent() post: PostModel): Promise<PostTagModel[]> {
    return this.prisma.postTag.findMany({
      where: { postId: post.id, isDeleted: false },
    });
  }
}
