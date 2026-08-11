import {
  Args,
  Context,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
  Query,
} from '@nestjs/graphql';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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

@Resolver(() => PostModel)
export class PostsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [PostModel], { name: 'posts' })
  async posts(): Promise<PostModel[]> {
    return this.prisma.post.findMany({ where: { isDeleted: false }, orderBy: { createdAt: 'desc' } });
  }

  @Query(() => PostModel, { name: 'post', nullable: true })
  async post(@Args('id') id: string): Promise<PostModel | null> {
    return this.prisma.post.findFirst({ where: { id, isDeleted: false } });
  }

  @Mutation(() => PostModel)
  async createPost(@Args('data') data: CreatePostInput, @Context() context: { req: { user: { sub: string } } }): Promise<PostModel> {
    if (data.authorId !== context.req.user.sub) throw new ForbiddenException('Vous ne pouvez publier qu’en votre nom.');
    const content = data.content?.trim() || null;
    const imageUploadIds = data.imageUploadIds ?? [];
    if (!content && imageUploadIds.length === 0) throw new BadRequestException('Ajoutez un texte ou au moins une image.');
    const uploads = imageUploadIds.length ? await this.prisma.upload.findMany({ where: { id: { in: imageUploadIds }, userId: context.req.user.sub, isDeleted: false, fileType: { startsWith: 'image/' } } }) : [];
    if (uploads.length !== imageUploadIds.length) throw new BadRequestException('Une ou plusieurs images sont invalides.');
    const { imageUploadIds: _imageUploadIds, ...postData } = data;
    return this.prisma.$transaction(async tx => {
      const post = await tx.post.create({ data: { ...postData, content, authorId: context.req.user.sub, attachments: imageUploadIds.length ? { create: imageUploadIds.map((uploadId, position) => ({ uploadId, position, kind: 'IMAGE' })) } : undefined } });
      await tx.auditLog.create({ data: { actorId: context.req.user.sub, action: 'POST_CREATED', entityType: 'post', entityId: post.id, metadata: { imageCount: imageUploadIds.length } } });
      return post;
    });
  }

  @Mutation(() => PostModel)
  async updatePost(
    @Args('id') id: string,
    @Args('data') data: UpdatePostInput,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<PostModel> {
    const post = await this.prisma.post.findFirst({ where: { id, isDeleted: false } });
    if (!post) throw new NotFoundException('Publication introuvable.');
    if (post.authorId !== context.req.user.sub) throw new ForbiddenException('Seul le propriétaire peut modifier cette publication.');
    const { authorId: _authorId, imageUploadIds: _imageUploadIds, ...safeData } = data;
    if (safeData.content !== undefined && !safeData.content?.trim()) {
      const imageCount = await this.prisma.postAttachment.count({ where: { postId: id, kind: 'IMAGE', isDeleted: false } });
      if (imageCount === 0) throw new BadRequestException('Une publication doit contenir du texte ou une image.');
      safeData.content = null;
    }
    return this.prisma.$transaction(async tx => {
      const updated = await tx.post.update({ where: { id }, data: safeData });
      await tx.auditLog.create({ data: { actorId: context.req.user.sub, action: 'POST_UPDATED', entityType: 'post', entityId: id, metadata: {} } });
      return updated;
    });
  }

  @Mutation(() => PostModel)
  async deletePost(@Args('id') id: string, @Context() context: { req: { user: { sub: string } } }): Promise<PostModel> {
    const post = await this.prisma.post.findFirst({ where: { id, isDeleted: false } });
    if (!post) throw new NotFoundException('Publication introuvable.');
    if (post.authorId !== context.req.user.sub) throw new ForbiddenException('Seul le propriétaire peut supprimer cette publication.');
    return this.prisma.$transaction(async tx => {
      const deleted = await tx.post.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date(), status: 'DELETED' } });
      await tx.auditLog.create({ data: { actorId: context.req.user.sub, action: 'POST_DELETED', entityType: 'post', entityId: id, metadata: {} } });
      return deleted;
    });
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
    return this.prisma.postTag.findMany({ where: { postId: post.id, isDeleted: false } });
  }
}
