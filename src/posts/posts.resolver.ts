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
import { PrismaService } from '../prisma/prisma.service';
import { PostsCommandService } from './posts-command.service';
import { PostsQueryService } from './posts-query.service';

type RequestContext = { req: { user: { sub: string; username: string } } };

@Resolver(() => PostModel)
export class PostsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: PostsQueryService,
    private readonly commands: PostsCommandService,
  ) {}

  @Query(() => [PostModel], { name: 'posts' })
  posts(
    @Context() context: RequestContext,
    @Args('after', { type: () => String, nullable: true }) after?: string,
    @Args('take', { type: () => Int, defaultValue: 20 }) take = 20,
  ): Promise<PostModel[]> {
    return this.queries.list(context.req.user.sub, after, take);
  }

  @Query(() => PostModel, { name: 'post', nullable: true })
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
  async author(@Parent() post: PostModel): Promise<UserModel | null> {
    if (Object.prototype.hasOwnProperty.call(post, 'author'))
      return post.author ?? null;
    return this.prisma.user.findUnique({ where: { id: post.authorId } });
  }

  @ResolveField(() => [CommentModel], { name: 'comments' })
  comments(@Parent() post: PostModel): Promise<CommentModel[]> {
    return this.prisma.comment.findMany({
      where: { postId: post.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [PostLikeModel], { name: 'likes' })
  likes(@Parent() post: PostModel): Promise<PostLikeModel[]> {
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
  attachments(@Parent() post: PostModel): Promise<PostAttachmentModel[]> {
    if (Object.prototype.hasOwnProperty.call(post, 'attachments'))
      return Promise.resolve(post.attachments ?? []);
    return this.prisma.postAttachment.findMany({
      where: { postId: post.id, isDeleted: false },
      orderBy: { position: 'asc' },
    });
  }

  @ResolveField(() => [UserModel], { name: 'mentionedUsers' })
  async mentionedUsers(@Parent() post: PostModel): Promise<UserModel[]> {
    if (Object.prototype.hasOwnProperty.call(post, 'mentionedUsers'))
      return post.mentionedUsers ?? [];
    const mentions = await this.prisma.postMention.findMany({
      where: { postId: post.id, isDeleted: false },
      include: { user: { include: { profile: true } } },
    });
    return mentions.map(({ user }) => user);
  }
}
