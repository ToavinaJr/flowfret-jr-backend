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
  CreateCommentInput,
  PostModel,
  UpdateCommentInput,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';
import { CommentsCommandService } from './comments-command.service';
import { CommentsQueryService } from './comments-query.service';
import { GraphqlRequestContext } from '../common/request-loaders';
import { RateLimits } from '../auth/rate-limit.decorator';

type RequestContext = GraphqlRequestContext;

@Resolver(() => CommentModel)
export class CommentsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: CommentsQueryService,
    private readonly commands: CommentsCommandService,
  ) {}

  @Query(() => [CommentModel], { name: 'comments' })
  @RateLimits({ limit: 120, windowSeconds: 60, failClosed: true })
  comments(@Context() context: RequestContext): Promise<CommentModel[]> {
    return this.queries.list(context.req.user.sub);
  }

  @Query(() => CommentModel, { name: 'comment', nullable: true })
  @RateLimits({ limit: 240, windowSeconds: 60, failClosed: true })
  comment(
    @Args('id') id: string,
    @Context() context: RequestContext,
  ): Promise<CommentModel | null> {
    return this.queries.find(id, context.req.user.sub);
  }

  @Query(() => [CommentModel], { name: 'commentsByPost' })
  @RateLimits({ limit: 120, windowSeconds: 60, failClosed: true })
  commentsByPost(
    @Args('postId') postId: string,
    @Args('skip', { type: () => Int, defaultValue: 0 }) skip: number,
    @Args('take', { type: () => Int, defaultValue: 20 }) take: number,
    @Context() context: RequestContext,
  ): Promise<CommentModel[]> {
    return this.queries.listByPost(postId, context.req.user.sub, skip, take);
  }

  @Mutation(() => CommentModel)
  createComment(
    @Args('data') data: CreateCommentInput,
    @Context() context: RequestContext,
  ): Promise<CommentModel> {
    return this.commands.create(data, context.req.user);
  }

  @Mutation(() => CommentModel)
  updateComment(
    @Args('id') id: string,
    @Args('data') data: UpdateCommentInput,
    @Context() context: RequestContext,
  ): Promise<CommentModel> {
    return this.commands.update(id, data, context.req.user.sub);
  }

  @Mutation(() => CommentModel)
  deleteComment(
    @Args('id') id: string,
    @Context() context: RequestContext,
  ): Promise<CommentModel> {
    return this.commands.delete(id, context.req.user.sub);
  }

  @ResolveField(() => PostModel, { name: 'post' })
  post(
    @Parent() comment: CommentModel,
    @Context() context?: RequestContext,
  ): Promise<PostModel | null> {
    if (context?.loaders) return context.loaders.postById.load(comment.postId);
    return this.prisma.post.findUnique({ where: { id: comment.postId } });
  }

  @ResolveField(() => UserModel, { name: 'author' })
  async author(
    @Parent() comment: CommentModel,
    @Context() context?: RequestContext,
  ): Promise<UserModel | null> {
    if (Object.prototype.hasOwnProperty.call(comment, 'author'))
      return comment.author ?? null;
    if (context?.loaders)
      return context.loaders.userById.load(comment.authorId);
    return this.prisma.user.findUnique({ where: { id: comment.authorId } });
  }

  @ResolveField(() => [UserModel], { name: 'mentionedUsers' })
  async mentionedUsers(
    @Parent() comment: CommentModel,
    @Context() context?: RequestContext,
  ): Promise<UserModel[]> {
    if (Object.prototype.hasOwnProperty.call(comment, 'mentionedUsers'))
      return comment.mentionedUsers ?? [];
    if (context?.loaders)
      return context.loaders.commentMentions.load(comment.id);
    const mentions = await this.prisma.commentMention.findMany({
      where: { commentId: comment.id, isDeleted: false },
      include: { user: { include: { profile: true } } },
    });
    return mentions.map(({ user }) => user);
  }
}
