import {
  Args,
  Mutation,
  Parent,
  ResolveField,
  Query,
  Resolver,
} from '@nestjs/graphql';
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

@Resolver(() => PostLikeModel)
export class PostInteractionsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [PostLikeModel], { name: 'postLikes' })
  async postLikes(): Promise<PostLikeModel[]> {
    return this.prisma.postLike.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Query(() => PostLikeModel, { name: 'postLike', nullable: true })
  async postLike(@Args('id') id: string): Promise<PostLikeModel | null> {
    return this.prisma.postLike.findUnique({ where: { id } });
  }

  @Query(() => [PostReportModel], { name: 'postReports' })
  async postReports(): Promise<PostReportModel[]> {
    return this.prisma.postReport.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Query(() => PostReportModel, { name: 'postReport', nullable: true })
  async postReport(@Args('id') id: string): Promise<PostReportModel | null> {
    return this.prisma.postReport.findUnique({ where: { id } });
  }

  @Query(() => [PostAttachmentModel], { name: 'postAttachments' })
  async postAttachments(): Promise<PostAttachmentModel[]> {
    return this.prisma.postAttachment.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  @Query(() => PostAttachmentModel, { name: 'postAttachment', nullable: true })
  async postAttachment(
    @Args('id') id: string,
  ): Promise<PostAttachmentModel | null> {
    return this.prisma.postAttachment.findUnique({ where: { id } });
  }

  @Mutation(() => PostLikeModel)
  async createPostLike(
    @Args('data') data: CreatePostLikeInput,
  ): Promise<PostLikeModel> {
    return this.prisma.postLike.create({ data });
  }

  @Mutation(() => PostLikeModel)
  async updatePostLike(
    @Args('id') id: string,
    @Args('data') data: UpdatePostLikeInput,
  ): Promise<PostLikeModel> {
    return this.prisma.postLike.update({ where: { id }, data });
  }

  @Mutation(() => PostLikeModel)
  async deletePostLike(@Args('id') id: string): Promise<PostLikeModel> {
    return this.prisma.postLike.delete({ where: { id } });
  }

  @Mutation(() => PostReportModel)
  async createPostReport(
    @Args('data') data: CreatePostReportInput,
  ): Promise<PostReportModel> {
    return this.prisma.postReport.create({ data });
  }

  @Mutation(() => PostReportModel)
  async updatePostReport(
    @Args('id') id: string,
    @Args('data') data: UpdatePostReportInput,
  ): Promise<PostReportModel> {
    return this.prisma.postReport.update({ where: { id }, data });
  }

  @Mutation(() => PostReportModel)
  async deletePostReport(@Args('id') id: string): Promise<PostReportModel> {
    return this.prisma.postReport.delete({ where: { id } });
  }

  @Mutation(() => PostAttachmentModel)
  async createPostAttachment(
    @Args('data') data: CreatePostAttachmentInput,
  ): Promise<PostAttachmentModel> {
    return this.prisma.postAttachment.create({ data });
  }

  @Mutation(() => PostAttachmentModel)
  async updatePostAttachment(
    @Args('id') id: string,
    @Args('data') data: UpdatePostAttachmentInput,
  ): Promise<PostAttachmentModel> {
    return this.prisma.postAttachment.update({ where: { id }, data });
  }

  @Mutation(() => PostAttachmentModel)
  async deletePostAttachment(
    @Args('id') id: string,
  ): Promise<PostAttachmentModel> {
    return this.prisma.postAttachment.delete({ where: { id } });
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
