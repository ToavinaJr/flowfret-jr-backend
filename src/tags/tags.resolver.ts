import {
  Args,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
  Query,
} from '@nestjs/graphql';
import {
  CreateTagInput,
  PostTagModel,
  TagModel,
  UpdateTagInput,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => TagModel)
export class TagsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [TagModel], { name: 'tags' })
  async tags(): Promise<TagModel[]> {
    return this.prisma.tag.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } });
  }

  @Query(() => TagModel, { name: 'tag', nullable: true })
  async tag(@Args('id') id: string): Promise<TagModel | null> {
    return this.prisma.tag.findFirst({ where: { id, isDeleted: false } });
  }

  @Mutation(() => TagModel)
  async createTag(@Args('data') data: CreateTagInput): Promise<TagModel> {
    return this.prisma.tag.create({ data });
  }

  @Mutation(() => TagModel)
  async updateTag(
    @Args('id') id: string,
    @Args('data') data: UpdateTagInput,
  ): Promise<TagModel> {
    return this.prisma.tag.update({ where: { id }, data });
  }

  @Mutation(() => TagModel)
  async deleteTag(@Args('id') id: string): Promise<TagModel> {
    return this.prisma.tag.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
  }

  @ResolveField(() => [PostTagModel], { name: 'postTags' })
  async postTags(@Parent() tag: TagModel): Promise<PostTagModel[]> {
    return this.prisma.postTag.findMany({ where: { tagId: tag.id } });
  }
}
