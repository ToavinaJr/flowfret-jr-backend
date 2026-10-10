import { BadRequestException, Injectable } from '@nestjs/common';
import { LyricsReport, ReportStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface LyricsReportTarget {
  provider: string;
  trackId: string;
  title: string;
  artist: string;
}

@Injectable()
export class LyricsReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async createReport(
    target: LyricsReportTarget,
    reporterId: string,
    reason: string,
    proposedLyrics?: string,
  ): Promise<LyricsReport> {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 5 || normalizedReason.length > 1000) {
      throw new BadRequestException({
        code: 'LYRICS_REPORT_REASON_INVALID',
        message: 'Report reason must contain between 5 and 1000 characters.',
      });
    }
    return this.prisma.lyricsReport.create({
      data: {
        ...target,
        reporterId,
        reason: normalizedReason,
        proposedLyrics: proposedLyrics?.trim() || null,
      },
    });
  }

  listReports(
    status: ReportStatus | undefined,
    take: number,
    skip: number,
  ): Promise<LyricsReport[]> {
    return this.prisma.lyricsReport.findMany({
      where: { isDeleted: false, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, take)),
      skip: Math.max(0, skip),
    });
  }

  async updateReportStatus(
    id: string,
    status: ReportStatus,
  ): Promise<LyricsReport> {
    if (status === ReportStatus.OPEN) {
      throw new BadRequestException({
        code: 'LYRICS_REPORT_STATUS_INVALID',
        message: 'Cannot revert a report back to OPEN.',
      });
    }
    return this.prisma.lyricsReport.update({
      where: { id },
      data: { status, reviewedAt: new Date() },
    });
  }

  resolveOpenReportsFor(provider: string, trackId: string): Promise<unknown> {
    return this.prisma.lyricsReport.updateMany({
      where: {
        provider,
        trackId,
        status: { in: [ReportStatus.OPEN, ReportStatus.REVIEWED] },
      },
      data: { status: ReportStatus.RESOLVED, reviewedAt: new Date() },
    });
  }
}
