import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreatePostAttachmentInput,
  CreatePostReportInput,
  PostAttachmentModel,
  PostReportModel,
  UpdatePostAttachmentInput,
  UpdatePostReportInput,
} from '../graphql/graphql.types';
import { requireVisiblePost } from '../common/post-access';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PostModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async createReport(
    data: CreatePostReportInput,
    actorId: string,
  ): Promise<PostReportModel> {
    if (data.reporterId !== actorId)
      throw new ForbiddenException('Action interdite.');
    await requireVisiblePost(this.prisma, data.postId, actorId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const report = await tx.postReport.create({
          data: {
            postId: data.postId,
            reporterId: actorId,
            reason: data.reason,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'POST_REPORTED',
            entityType: 'post',
            entityId: data.postId,
            metadata: { reportId: report.id },
          },
        });
        return report;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Cette publication est déjà signalée.');
      throw error;
    }
  }

  updateReport(
    id: string,
    data: UpdatePostReportInput,
  ): Promise<PostReportModel> {
    if (!data.status)
      throw new BadRequestException('Un statut de modération est requis.');
    return this.prisma.postReport.update({
      where: { id },
      data: { status: data.status, reviewedAt: new Date() },
    });
  }

  deleteReport(id: string): Promise<PostReportModel> {
    return this.prisma.postReport.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  createAttachment(
    data: CreatePostAttachmentInput,
  ): Promise<PostAttachmentModel> {
    return this.prisma.postAttachment.create({ data });
  }

  updateAttachment(
    id: string,
    data: UpdatePostAttachmentInput,
  ): Promise<PostAttachmentModel> {
    return this.prisma.postAttachment.update({ where: { id }, data });
  }

  deleteAttachment(id: string): Promise<PostAttachmentModel> {
    return this.prisma.postAttachment.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }
}
