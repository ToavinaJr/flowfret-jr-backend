import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
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
} from '../graphql/graphql.types';
import { Roles } from '../auth/roles.decorator';
import { PostInteractionsQueryService } from './post-interactions-query.service';
import { PostLikesService } from './post-likes.service';
import { PostModerationService } from './post-moderation.service';

type RequestContext = { req: { user: { sub: string; username?: string } } };

@Resolver(() => PostLikeModel)
export class PostInteractionsResolver {
  constructor(
    private readonly queries: PostInteractionsQueryService,
    private readonly likesService: PostLikesService,
    private readonly moderation: PostModerationService,
  ) {}

  @Query(() => [PostLikeModel], { name: 'postLikes' })
  postLikes(@Context() context: RequestContext): Promise<PostLikeModel[]> {
    return this.queries.likes(context.req.user.sub);
  }

  @Query(() => PostLikeModel, { name: 'postLike', nullable: true })
  postLike(
    @Args('id') id: string,
    @Context() context: RequestContext,
  ): Promise<PostLikeModel | null> {
    return this.queries.like(id, context.req.user.sub);
  }

  @Query(() => [PostReportModel], { name: 'postReports' })
  @Roles(UserRole.ADMIN)
  postReports(
    @Args('take', { type: () => Int, defaultValue: 50 }) take: number,
  ): Promise<PostReportModel[]> {
    return this.queries.reports(take);
  }

  @Query(() => PostReportModel, { name: 'postReport', nullable: true })
  @Roles(UserRole.ADMIN)
  postReport(@Args('id') id: string): Promise<PostReportModel | null> {
    return this.queries.report(id);
  }

  @Query(() => [PostAttachmentModel], { name: 'postAttachments' })
  @Roles(UserRole.ADMIN)
  postAttachments(): Promise<PostAttachmentModel[]> {
    return this.queries.attachments();
  }

  @Query(() => PostAttachmentModel, { name: 'postAttachment', nullable: true })
  @Roles(UserRole.ADMIN)
  postAttachment(@Args('id') id: string): Promise<PostAttachmentModel | null> {
    return this.queries.attachment(id);
  }

  @Mutation(() => PostLikeModel)
  createPostLike(
    @Args('data') data: CreatePostLikeInput,
    @Context() context: RequestContext,
  ): Promise<PostLikeModel> {
    return this.likesService.create(data.postId, data.userId, context.req.user);
  }

  @Mutation(() => PostLikeModel)
  @Roles(UserRole.ADMIN)
  updatePostLike(
    @Args('id') id: string,
    @Args('data') data: UpdatePostLikeInput,
  ): Promise<PostLikeModel> {
    return this.likesService.update(id, data);
  }

  @Mutation(() => PostLikeModel)
  deletePostLike(
    @Args('id') id: string,
    @Context() context: RequestContext,
  ): Promise<PostLikeModel> {
    return this.likesService.delete(id, context.req.user.sub);
  }

  @Mutation(() => PostReportModel)
  createPostReport(
    @Args('data') data: CreatePostReportInput,
    @Context() context: RequestContext,
  ): Promise<PostReportModel> {
    if (data.reporterId !== context.req.user.sub)
      throw new ForbiddenException('Action interdite.');
    return this.moderation.createReport(data, context.req.user.sub);
  }

  @Mutation(() => PostReportModel)
  @Roles(UserRole.ADMIN)
  updatePostReport(
    @Args('id') id: string,
    @Args('data') data: UpdatePostReportInput,
  ): Promise<PostReportModel> {
    return this.moderation.updateReport(id, data);
  }

  @Mutation(() => PostReportModel)
  @Roles(UserRole.ADMIN)
  deletePostReport(@Args('id') id: string): Promise<PostReportModel> {
    return this.moderation.deleteReport(id);
  }

  @Mutation(() => PostAttachmentModel)
  @Roles(UserRole.ADMIN)
  createPostAttachment(
    @Args('data') data: CreatePostAttachmentInput,
  ): Promise<PostAttachmentModel> {
    return this.moderation.createAttachment(data);
  }

  @Mutation(() => PostAttachmentModel)
  @Roles(UserRole.ADMIN)
  updatePostAttachment(
    @Args('id') id: string,
    @Args('data') data: UpdatePostAttachmentInput,
  ): Promise<PostAttachmentModel> {
    return this.moderation.updateAttachment(id, data);
  }

  @Mutation(() => PostAttachmentModel)
  @Roles(UserRole.ADMIN)
  deletePostAttachment(@Args('id') id: string): Promise<PostAttachmentModel> {
    return this.moderation.deleteAttachment(id);
  }
}
