import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import {
  CreatePostAttachmentInput,
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
    postId: string,
    reason: string,
    actorId: string,
  ): Promise<PostReportModel> {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 5 || normalizedReason.length > 1000) {
      throw new BadRequestException({
        code: 'POST_REPORT_REASON_INVALID',
        message: 'Report reason must contain between 5 and 1000 characters.',
      });
    }
    await requireVisiblePost(this.prisma, postId, actorId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const report = await tx.postReport.create({
          data: {
            postId,
            reporterId: actorId,
            reason: normalizedReason,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: AUDIT_ACTION.POST_REPORTED,
            entityType: AUDIT_ENTITY.POST,
            entityId: postId,
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
