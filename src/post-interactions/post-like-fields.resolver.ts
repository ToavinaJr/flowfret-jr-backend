import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { PostLikeModel, PostModel, UserModel } from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => PostLikeModel)
export class PostLikeFieldsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @ResolveField(() => PostModel, { name: 'post' })
  post(@Parent() row: PostLikeModel): Promise<PostModel | null> {
    return this.prisma.post.findUnique({ where: { id: row.postId } });
  }

  @ResolveField(() => UserModel, { name: 'user', nullable: true })
  user(@Parent() row: PostLikeModel): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: row.userId } });
  }
}
