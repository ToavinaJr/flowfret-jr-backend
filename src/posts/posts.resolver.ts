import { UserRole } from '@prisma/client';
import {
  Args,
  Context,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import {
  CommentModel,
  CreatePostInput,
  PostAttachmentModel,
  PostLikeModel,
  PostModel,
  PostReportModel,
  UpdatePostInput,
  UserModel,
} from '../graphql/graphql.types';
import { Roles } from '../auth/roles.decorator';
import { RateLimits } from '../auth/rate-limit.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PostsCommandService } from './posts-command.service';
import { PostsQueryService } from './posts-query.service';
import { GraphqlRequestContext } from '../common/request-loaders';

type RequestContext = GraphqlRequestContext;

@Resolver(() => PostModel)
export class PostsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: PostsQueryService,
    private readonly commands: PostsCommandService,
  ) {}

  @Query(() => [PostModel], { name: 'posts' })
  @RateLimits(
    { limit: 120, windowSeconds: 60, failClosed: true },
    { limit: 1200, windowSeconds: 3600, failClosed: true },
  )
  posts(
    @Context() context: RequestContext,
    @Args('after', { type: () => String, nullable: true }) after?: string,
    @Args('take', { type: () => Int, defaultValue: 20 }) take = 20,
    @Args('query', { type: () => String, nullable: true }) query?: string,
  ): Promise<PostModel[]> {
    return this.queries.list(context.req.user.sub, after, take, query);
  }

  @Query(() => PostModel, { name: 'post', nullable: true })
  @RateLimits({ limit: 240, windowSeconds: 60, failClosed: true })
  post(
    @Args('id') id: string,
    @Context() context: RequestContext,
  ): Promise<PostModel | null> {
    return this.queries.find(id, context.req.user.sub);
  }

  @Mutation(() => PostModel)
  createPost(
    @Args('data') data: CreatePostInput,
    @Context() context: RequestContext,
  ): Promise<PostModel> {
    return this.commands.create(data, context.req.user);
  }

  @Mutation(() => PostModel)
  updatePost(
    @Args('id') id: string,
    @Args('data') data: UpdatePostInput,
    @Context() context: RequestContext,
  ): Promise<PostModel> {
    return this.commands.update(id, data, context.req.user.sub);
  }

  @Mutation(() => PostModel)
  deletePost(
    @Args('id') id: string,
    @Context() context: RequestContext,
  ): Promise<PostModel> {
    return this.commands.delete(id, context.req.user.sub);
  }

  @ResolveField(() => UserModel, { name: 'author' })
  async author(
    @Parent() post: PostModel,
    @Context() context?: RequestContext,
  ): Promise<UserModel | null> {
    if (Object.prototype.hasOwnProperty.call(post, 'author'))
      return post.author ?? null;
    if (context?.loaders) return context.loaders.userById.load(post.authorId);
    return this.prisma.user.findUnique({ where: { id: post.authorId } });
  }

  @ResolveField(() => [CommentModel], { name: 'comments' })
  comments(
    @Parent() post: PostModel,
    @Context() context?: RequestContext,
  ): Promise<CommentModel[]> {
    if (context?.loaders) return context.loaders.commentsByPostId.load(post.id);
    return this.prisma.comment.findMany({
      where: { postId: post.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [PostLikeModel], { name: 'likes' })
  likes(
    @Parent() post: PostModel,
    @Context() context?: RequestContext,
  ): Promise<PostLikeModel[]> {
    if (context?.loaders) return context.loaders.likesByPostId.load(post.id);
    return this.prisma.postLike.findMany({
      where: { postId: post.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => Boolean, { name: 'viewerHasLiked' })
  async viewerHasLiked(
    @Parent() post: PostModel,
    @Context() context: RequestContext,
  ): Promise<boolean> {
    if (typeof post.viewerHasLiked === 'boolean') return post.viewerHasLiked;
    return Boolean(
      await this.prisma.postLike.count({
        where: {
          postId: post.id,
          userId: context.req.user.sub,
          isDeleted: false,
        },
      }),
    );
  }

  @ResolveField(() => String, { name: 'viewerLikeId', nullable: true })
  async viewerLikeId(
    @Parent() post: PostModel,
    @Context() context: RequestContext,
  ): Promise<string | null> {
    if (post.viewerLikeId !== undefined) return post.viewerLikeId;
    const like = await this.prisma.postLike.findFirst({
      where: {
        postId: post.id,
        userId: context.req.user.sub,
        isDeleted: false,
      },
      select: { id: true },
    });
    return like?.id ?? null;
  }

  @ResolveField(() => [PostReportModel], { name: 'reports' })
  @Roles(UserRole.ADMIN)
  reports(@Parent() post: PostModel): Promise<PostReportModel[]> {
    return this.prisma.postReport.findMany({
      where: { postId: post.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [PostAttachmentModel], { name: 'attachments' })
  attachments(
    @Parent() post: PostModel,
    @Context() context?: RequestContext,
  ): Promise<PostAttachmentModel[]> {
    if (Object.prototype.hasOwnProperty.call(post, 'attachments'))
      return Promise.resolve(post.attachments ?? []);
    if (context?.loaders)
      return context.loaders.attachmentsByPostId.load(post.id);
    return this.prisma.postAttachment.findMany({
      where: { postId: post.id, isDeleted: false },
      orderBy: { position: 'asc' },
    });
  }

  @ResolveField(() => [UserModel], { name: 'mentionedUsers' })
  async mentionedUsers(
    @Parent() post: PostModel,
    @Context() context?: RequestContext,
  ): Promise<UserModel[]> {
    if (Object.prototype.hasOwnProperty.call(post, 'mentionedUsers'))
      return post.mentionedUsers ?? [];
    if (context?.loaders) return context.loaders.postMentions.load(post.id);
    const mentions = await this.prisma.postMention.findMany({
      where: { postId: post.id, isDeleted: false },
      include: { user: { include: { profile: true } } },
    });
    return mentions.map(({ user }) => user);
  }
}
