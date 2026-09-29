import { ResolveField, Resolver } from '@nestjs/graphql';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUser, AdminUserActivity } from './admin.types';

@Resolver(() => AdminUser)
export class AdminUserActivityResolver {
  constructor(private readonly prisma: PrismaService) {}

  @ResolveField(() => AdminUserActivity)
  async activity(user: AdminUser): Promise<AdminUserActivity> {
    const [posts, comments, playlists, uploads] = await Promise.all([
      this.prisma.post.count({
        where: { authorId: user.id, isDeleted: false },
      }),
      this.prisma.comment.count({
        where: { authorId: user.id, isDeleted: false },
      }),
      this.prisma.playlist.count({
        where: { userId: user.id, isDeleted: false },
      }),
      this.prisma.upload.count({
        where: { userId: user.id, isDeleted: false },
      }),
    ]);
    return { posts, comments, playlists, uploads };
  }
}
