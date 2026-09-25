import { Injectable } from '@nestjs/common';
import { Prisma, ReportStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminCategoryStatistic,
  AdminDailyStatistic,
  AdminDashboardStatistics,
} from './admin.types';

const TRACK_LISTEN_MUTATION = 'MUTATION_RECORDTRACKLISTEN';

type DailyRow = {
  date: string;
  users: bigint | number;
  posts: bigint | number;
  comments: bigint | number;
  reports: bigint | number;
  trackPlays: bigint | number;
};

@Injectable()
export class AdminStatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(requestedDays = 30): Promise<AdminDashboardStatistics> {
    const days = Math.min(365, Math.max(7, Math.trunc(requestedDays)));
    const periodEnd = new Date();
    const periodStart = this.utcDayStart(periodEnd);
    periodStart.setUTCDate(periodStart.getUTCDate() - (days - 1));

    const [
      users,
      activeUsers,
      posts,
      comments,
      openReports,
      uploads,
      transcriptions,
      chordTranscriptions,
      playlists,
      catalogTracks,
      trackPlayAggregate,
      newUsers,
      newPosts,
      newComments,
      newUploads,
      newTranscriptions,
      reportsCreated,
      periodTrackPlays,
      usersByStatus,
      transcriptionsByStatus,
      playsByProvider,
    ] = await Promise.all([
      this.prisma.user.count({ where: { isDeleted: false } }),
      this.prisma.user.count({
        where: { isDeleted: false, status: UserStatus.ACTIVE },
      }),
      this.prisma.post.count({ where: { isDeleted: false } }),
      this.prisma.comment.count({ where: { isDeleted: false } }),
      this.prisma.postReport.count({
        where: { isDeleted: false, status: ReportStatus.OPEN },
      }),
      this.prisma.upload.count({ where: { isDeleted: false } }),
      this.prisma.transcription.count({ where: { isDeleted: false } }),
      this.prisma.chordTranscription.count(),
      this.prisma.playlist.count({ where: { isDeleted: false } }),
      this.prisma.catalogTrack.count(),
      this.prisma.listeningHistory.aggregate({ _sum: { playCount: true } }),
      this.prisma.user.count({
        where: { isDeleted: false, createdAt: { gte: periodStart } },
      }),
      this.prisma.post.count({
        where: { isDeleted: false, createdAt: { gte: periodStart } },
      }),
      this.prisma.comment.count({
        where: { isDeleted: false, createdAt: { gte: periodStart } },
      }),
      this.prisma.upload.count({
        where: { isDeleted: false, createdAt: { gte: periodStart } },
      }),
      this.prisma.transcription.count({
        where: { isDeleted: false, createdAt: { gte: periodStart } },
      }),
      this.prisma.postReport.count({
        where: { isDeleted: false, createdAt: { gte: periodStart } },
      }),
      this.prisma.auditLog.count({
        where: {
          isDeleted: false,
          action: TRACK_LISTEN_MUTATION,
          createdAt: { gte: periodStart },
        },
      }),
      this.prisma.user.groupBy({
        by: ['status'],
        where: { isDeleted: false },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.transcription.groupBy({
        by: ['status'],
        where: { isDeleted: false },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.listeningHistory.groupBy({
        by: ['provider'],
        _sum: { playCount: true },
        orderBy: { provider: 'asc' },
      }),
    ] as const);

    const dailyRows = await this.dailyRows(periodStart, periodEnd);
    return {
      generatedAt: periodEnd,
      periodStart,
      periodEnd,
      days,
      totals: {
        users,
        activeUsers,
        posts,
        comments,
        openReports,
        uploads,
        transcriptions,
        chordTranscriptions,
        playlists,
        catalogTracks,
        trackPlays: trackPlayAggregate._sum.playCount ?? 0,
      },
      period: {
        newUsers,
        newPosts,
        newComments,
        newUploads,
        newTranscriptions,
        reportsCreated,
        trackPlays: periodTrackPlays,
      },
      daily: dailyRows.map((row) => this.mapDaily(row)),
      usersByStatus: usersByStatus.map((row) => ({
        key: row.status,
        count: row._count._all,
      })),
      transcriptionsByStatus: transcriptionsByStatus.map((row) => ({
        key: row.status,
        count: row._count._all,
      })),
      playsByProvider: playsByProvider.map((row) => ({
        key: row.provider,
        count: row._sum.playCount ?? 0,
      })),
    };
  }

  private dailyRows(start: Date, end: Date): Promise<DailyRow[]> {
    return this.prisma.$queryRaw<DailyRow[]>(Prisma.sql`
      WITH days AS (
        SELECT generate_series(${start}::date, ${end}::date, interval '1 day')::date AS day
      ), user_counts AS (
        SELECT created_at::date AS day, COUNT(*) AS count
        FROM users
        WHERE created_at >= ${start} AND is_deleted = false
        GROUP BY created_at::date
      ), post_counts AS (
        SELECT created_at::date AS day, COUNT(*) AS count
        FROM posts
        WHERE created_at >= ${start} AND is_deleted = false
        GROUP BY created_at::date
      ), comment_counts AS (
        SELECT created_at::date AS day, COUNT(*) AS count
        FROM comments
        WHERE created_at >= ${start} AND is_deleted = false
        GROUP BY created_at::date
      ), report_counts AS (
        SELECT created_at::date AS day, COUNT(*) AS count
        FROM post_reports
        WHERE created_at >= ${start} AND is_deleted = false
        GROUP BY created_at::date
      ), play_counts AS (
        SELECT created_at::date AS day, COUNT(*) AS count
        FROM audit_logs
        WHERE created_at >= ${start}
          AND is_deleted = false
          AND action = ${TRACK_LISTEN_MUTATION}
        GROUP BY created_at::date
      )
      SELECT
        to_char(days.day, 'YYYY-MM-DD') AS date,
        COALESCE(user_counts.count, 0) AS users,
        COALESCE(post_counts.count, 0) AS posts,
        COALESCE(comment_counts.count, 0) AS comments,
        COALESCE(report_counts.count, 0) AS reports,
        COALESCE(play_counts.count, 0) AS "trackPlays"
      FROM days
      LEFT JOIN user_counts ON user_counts.day = days.day
      LEFT JOIN post_counts ON post_counts.day = days.day
      LEFT JOIN comment_counts ON comment_counts.day = days.day
      LEFT JOIN report_counts ON report_counts.day = days.day
      LEFT JOIN play_counts ON play_counts.day = days.day
      ORDER BY days.day ASC
    `);
  }

  private mapDaily(row: DailyRow): AdminDailyStatistic {
    return {
      date: row.date,
      users: Number(row.users),
      posts: Number(row.posts),
      comments: Number(row.comments),
      reports: Number(row.reports),
      trackPlays: Number(row.trackPlays),
    };
  }

  private utcDayStart(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }
}
