import { Injectable } from '@nestjs/common';
import { PostModel } from '../graphql/graphql.types';
import { visiblePostWhere } from '../common/post-access';
import { PrismaService } from '../prisma/prisma.service';
import { toPostModel } from './post.mapper';

const feedInclude = (viewerId: string) => ({
  author: { include: { profile: true } },
  likes: {
    where: { userId: viewerId, isDeleted: false },
    select: { id: true },
    take: 1,
  },
  attachments: {
    where: { isDeleted: false },
    orderBy: { position: 'asc' as const },
    include: { upload: true },
  },
  mentions: {
    where: { isDeleted: false },
    include: { user: { include: { profile: true } } },
  },
});

@Injectable()
export class PostsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    viewerId: string,
    after?: string,
    take = 20,
  ): Promise<PostModel[]> {
    const rows = await this.prisma.post.findMany({
      where: { ...(await visiblePostWhere(this.prisma, viewerId)) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(50, Math.max(1, take)),
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      include: feedInclude(viewerId),
    });
    return rows.map(toPostModel);
  }

  async find(id: string, viewerId: string): Promise<PostModel | null> {
    const row = await this.prisma.post.findFirst({
      where: { ...(await visiblePostWhere(this.prisma, viewerId)), id },
      include: feedInclude(viewerId),
    });
    return row ? toPostModel(row) : null;
  }
}
