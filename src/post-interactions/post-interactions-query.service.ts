import { Injectable } from '@nestjs/common';
import {
  PostAttachmentModel,
  PostLikeModel,
  PostReportModel,
} from '../graphql/graphql.types';
import { requireVisiblePost, visiblePostWhere } from '../common/post-access';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PostInteractionsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async likes(viewerId: string): Promise<PostLikeModel[]> {
    return this.prisma.postLike.findMany({
      where: {
        isDeleted: false,
        post: await visiblePostWhere(this.prisma, viewerId),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async like(id: string, viewerId: string): Promise<PostLikeModel | null> {
    const like = await this.prisma.postLike.findFirst({
      where: { id, isDeleted: false },
    });
    if (like) await requireVisiblePost(this.prisma, like.postId, viewerId);
    return like;
  }

  reports(take: number): Promise<PostReportModel[]> {
    return this.prisma.postReport.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, take)),
      include: { post: { include: { author: true } }, reporter: true },
    });
  }

  report(id: string): Promise<PostReportModel | null> {
    return this.prisma.postReport.findFirst({
      where: { id, isDeleted: false },
    });
  }

  attachments(): Promise<PostAttachmentModel[]> {
    return this.prisma.postAttachment.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  attachment(id: string): Promise<PostAttachmentModel | null> {
    return this.prisma.postAttachment.findFirst({
      where: { id, isDeleted: false },
    });
  }
}
