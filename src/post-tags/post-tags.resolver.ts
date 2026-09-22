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
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';

@Resolver(() => PostTagModel)
export class PostTagsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [PostTagModel], { name: 'postTags' })
  @Roles(UserRole.ADMIN)
  async postTags(): Promise<PostTagModel[]> {
    return this.prisma.postTag.findMany();
  }

  @Mutation(() => PostTagModel)
  @Roles(UserRole.ADMIN)
  async createPostTag(
    @Args('data') data: CreatePostTagInput,
  ): Promise<PostTagModel> {
    return this.prisma.postTag.create({ data });
  }

  @Mutation(() => PostTagModel)
  @Roles(UserRole.ADMIN)
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
  @Roles(UserRole.ADMIN)
  async deletePostTag(
    @Args('postId') postId: string,
    @Args('tagId') tagId: string,
  ): Promise<PostTagModel> {
    return this.prisma.postTag.update({
      where: { postId_tagId: { postId, tagId } },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  @Query(() => PostTagModel, { name: 'postTag', nullable: true })
  @Roles(UserRole.ADMIN)
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
    if (Object.prototype.hasOwnProperty.call(postTag, 'tag'))
      return postTag.tag ?? null;
    return this.prisma.tag.findUnique({ where: { id: postTag.tagId } });
  }
}
