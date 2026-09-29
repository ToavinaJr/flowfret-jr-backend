import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReportStatus } from '@prisma/client';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async moderateReport(
    actorId: string,
    reportId: string,
    status: ReportStatus,
    rawReason: string,
  ): Promise<ReportStatus> {
    const reason = rawReason.trim();
    if (reason.length < 3 || reason.length > 500) {
      throw new BadRequestException({
        code: 'ADMIN_MODERATION_REASON_INVALID',
        message: 'A moderation reason between 3 and 500 characters is required.',
      });
    }
    if (status === ReportStatus.OPEN) {
      throw new BadRequestException({
        code: 'ADMIN_MODERATION_STATUS_INVALID',
        message: 'A report cannot be moved back to open.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const report = await tx.postReport.findUnique({
        where: { id: reportId },
        select: { id: true, postId: true, status: true, isDeleted: true },
      });
      if (!report || report.isDeleted) {
        throw new NotFoundException({
          code: 'ADMIN_REPORT_NOT_FOUND',
          message: 'Report not found.',
        });
      }
      if (report.status === status) {
        throw new ConflictException({
          code: 'ADMIN_REPORT_STATUS_UNCHANGED',
          message: 'Report already has this status.',
        });
      }

      await tx.postReport.update({
        where: { id: reportId },
        data: { status, reviewedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: AUDIT_ACTION.ADMIN_POST_REPORT_MODERATED,
          entityType: AUDIT_ENTITY.POST,
          entityId: report.postId,
          metadata: {
            reportId,
            reason,
            previousStatus: report.status,
            nextStatus: status,
          } satisfies Prisma.InputJsonObject,
        },
      });
      return status;
    });
  }
}
