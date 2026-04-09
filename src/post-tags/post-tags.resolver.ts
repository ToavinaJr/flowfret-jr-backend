import {
  Args,
  Mutation,
  Parent,
  ResolveField,
  Query,
  Resolver,
} from '@nestjs/graphql';
import {
  CreatePostTagInput,
  PostModel,
  PostTagModel,
  TagModel,
  UpdatePostTagInput,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => PostTagModel)
export class PostTagsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [PostTagModel], { name: 'postTags' })
  async postTags(): Promise<PostTagModel[]> {
    return this.prisma.postTag.findMany();
  }

  @Mutation(() => PostTagModel)
  async createPostTag(
    @Args('data') data: CreatePostTagInput,
  ): Promise<PostTagModel> {
    return this.prisma.postTag.create({ data });
  }

  @Mutation(() => PostTagModel)
  async updatePostTag(
    @Args('postId') postId: string,
    @Args('tagId') tagId: string,
    @Args('data') data: UpdatePostTagInput,
  ): Promise<PostTagModel> {
    return this.prisma.postTag.update({
      where: { postId_tagId: { postId, tagId } },
      data,
    });
  }

  @Mutation(() => PostTagModel)
  async deletePostTag(
    @Args('postId') postId: string,
    @Args('tagId') tagId: string,
  ): Promise<PostTagModel> {
    return this.prisma.postTag.delete({
      where: { postId_tagId: { postId, tagId } },
    });
  }

  @Query(() => PostTagModel, { name: 'postTag', nullable: true })
  async postTag(
    @Args('postId') postId: string,
    @Args('tagId') tagId: string,
  ): Promise<PostTagModel | null> {
    return this.prisma.postTag.findUnique({
      where: { postId_tagId: { postId, tagId } },
    });
  }

  @ResolveField(() => PostModel, { name: 'post' })
  async post(@Parent() postTag: PostTagModel): Promise<PostModel | null> {
    return this.prisma.post.findUnique({ where: { id: postTag.postId } });
  }

  @ResolveField(() => TagModel, { name: 'tag' })
  async tag(@Parent() postTag: PostTagModel): Promise<TagModel | null> {
    return this.prisma.tag.findUnique({ where: { id: postTag.tagId } });
  }
}
