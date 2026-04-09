import {
  Args,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
  Query,
} from '@nestjs/graphql';
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
    return this.prisma.post.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Query(() => PostModel, { name: 'post', nullable: true })
  async post(@Args('id') id: string): Promise<PostModel | null> {
    return this.prisma.post.findUnique({ where: { id } });
  }

  @Mutation(() => PostModel)
  async createPost(@Args('data') data: CreatePostInput): Promise<PostModel> {
    return this.prisma.post.create({ data });
  }

  @Mutation(() => PostModel)
  async updatePost(
    @Args('id') id: string,
    @Args('data') data: UpdatePostInput,
  ): Promise<PostModel> {
    return this.prisma.post.update({ where: { id }, data });
  }

  @Mutation(() => PostModel)
  async deletePost(@Args('id') id: string): Promise<PostModel> {
    return this.prisma.post.delete({ where: { id } });
  }

  @ResolveField(() => UserModel, { name: 'author' })
  async author(@Parent() post: PostModel): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: post.authorId } });
  }

  @ResolveField(() => [CommentModel], { name: 'comments' })
  async comments(@Parent() post: PostModel): Promise<CommentModel[]> {
    return this.prisma.comment.findMany({
      where: { postId: post.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [PostLikeModel], { name: 'likes' })
  async likes(@Parent() post: PostModel): Promise<PostLikeModel[]> {
    return this.prisma.postLike.findMany({
      where: { postId: post.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [PostReportModel], { name: 'reports' })
  async reports(@Parent() post: PostModel): Promise<PostReportModel[]> {
    return this.prisma.postReport.findMany({
      where: { postId: post.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [PostAttachmentModel], { name: 'attachments' })
  async attachments(@Parent() post: PostModel): Promise<PostAttachmentModel[]> {
    return this.prisma.postAttachment.findMany({
      where: { postId: post.id },
      orderBy: { position: 'asc' },
    });
  }

  @ResolveField(() => [PostTagModel], { name: 'tags' })
  async tags(@Parent() post: PostModel): Promise<PostTagModel[]> {
    return this.prisma.postTag.findMany({ where: { postId: post.id } });
  }
}
