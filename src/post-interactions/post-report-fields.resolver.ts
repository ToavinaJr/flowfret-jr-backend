import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import {
  PostModel,
  PostReportModel,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => PostReportModel)
export class PostReportsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @ResolveField(() => PostModel, { name: 'post' })
  post(@Parent() row: PostReportModel): Promise<PostModel | null> {
    if (Object.prototype.hasOwnProperty.call(row, 'post'))
      return Promise.resolve(row.post ?? null);
    return this.prisma.post.findUnique({ where: { id: row.postId } });
  }

  @ResolveField(() => UserModel, { name: 'reporter' })
  reporter(@Parent() row: PostReportModel): Promise<UserModel | null> {
    if (Object.prototype.hasOwnProperty.call(row, 'reporter'))
      return Promise.resolve(row.reporter ?? null);
    return this.prisma.user.findUnique({ where: { id: row.reporterId } });
  }
}
