import { ReportStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { LyricsReportsService } from './lyrics-reports.service';

describe('LyricsReportsService', () => {
  const prisma = {
    lyricsReport: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  let service: LyricsReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LyricsReportsService(prisma as unknown as PrismaService);
  });

  describe('createReport', () => {
    const target = {
      provider: 'YOUTUBE',
      trackId: 'abc',
      title: 'Song',
      artist: 'Artist',
    };

    it('rejects a reason shorter than 5 characters', async () => {
      await expect(
        service.createReport(target, 'user-1', 'bad'),
      ).rejects.toThrow();
      expect(prisma.lyricsReport.create).not.toHaveBeenCalled();
    });

    it('rejects a reason longer than 1000 characters', async () => {
      await expect(
        service.createReport(target, 'user-1', 'x'.repeat(1001)),
      ).rejects.toThrow();
    });

    it('creates a report with a trimmed reason', async () => {
      prisma.lyricsReport.create.mockResolvedValue({ id: 'report-1' });
      await service.createReport(target, 'user-1', '  Wrong lines  ');
      expect(prisma.lyricsReport.create).toHaveBeenCalledWith({
        data: { ...target, reporterId: 'user-1', reason: 'Wrong lines' },
      });
    });
  });

  describe('updateReportStatus', () => {
    it('rejects reverting to OPEN', async () => {
      await expect(
        service.updateReportStatus('report-1', ReportStatus.OPEN),
      ).rejects.toThrow();
      expect(prisma.lyricsReport.update).not.toHaveBeenCalled();
    });

    it('updates the status and stamps reviewedAt', async () => {
      prisma.lyricsReport.update.mockResolvedValue({ id: 'report-1' });
      await service.updateReportStatus('report-1', ReportStatus.RESOLVED);
      const calls = prisma.lyricsReport.update.mock.calls as Array<
        [
          {
            where: { id: string };
            data: { status: ReportStatus; reviewedAt: Date };
          },
        ]
      >;
      const call = calls[0][0];
      expect(call.where).toEqual({ id: 'report-1' });
      expect(call.data.status).toBe(ReportStatus.RESOLVED);
      expect(call.data.reviewedAt).toBeInstanceOf(Date);
    });
  });

  describe('resolveOpenReportsFor', () => {
    it('resolves OPEN and REVIEWED reports for the given track', async () => {
      await service.resolveOpenReportsFor('YOUTUBE', 'abc');
      const calls = prisma.lyricsReport.updateMany.mock.calls as Array<
        [{ where: unknown; data: { status: ReportStatus; reviewedAt: Date } }]
      >;
      const call = calls[0][0];
      expect(call.where).toEqual({
        provider: 'YOUTUBE',
        trackId: 'abc',
        status: { in: [ReportStatus.OPEN, ReportStatus.REVIEWED] },
      });
      expect(call.data.status).toBe(ReportStatus.RESOLVED);
      expect(call.data.reviewedAt).toBeInstanceOf(Date);
    });
  });
});
