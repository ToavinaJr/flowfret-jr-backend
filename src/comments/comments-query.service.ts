import { Injectable } from '@nestjs/common';
import { CommentModel } from '../graphql/graphql.types';
import { requireVisiblePost, visiblePostWhere } from '../common/post-access';
import { PrismaService } from '../prisma/prisma.service';
import { toCommentModel } from './comment.mapper';

const commentInclude = {
  author: { include: { profile: true } },
  mentions: {
    where: { isDeleted: false },
    include: { user: { include: { profile: true } } },
  },
};

@Injectable()
export class CommentsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(viewerId: string): Promise<CommentModel[]> {
    const rows = await this.prisma.comment.findMany({
      where: {
        isDeleted: false,
        post: await visiblePostWhere(this.prisma, viewerId),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: commentInclude,
    });
    return rows.map(toCommentModel);
  }

  async find(id: string, viewerId: string): Promise<CommentModel | null> {
    const comment = await this.prisma.comment.findFirst({
      where: { id, isDeleted: false },
      include: commentInclude,
    });
    if (!comment) return null;
    await requireVisiblePost(this.prisma, comment.postId, viewerId);
    return toCommentModel(comment);
  }

  async listByPost(
    postId: string,
    viewerId: string,
    skip: number,
    take: number,
  ): Promise<CommentModel[]> {
    await requireVisiblePost(this.prisma, postId, viewerId);
    const rows = await this.prisma.comment.findMany({
      where: { postId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      skip: Math.max(0, skip),
      take: Math.min(50, Math.max(1, take)),
      include: commentInclude,
    });
    return rows.map(toCommentModel);
  }
}
