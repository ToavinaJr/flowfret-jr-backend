import { MusicProvider, TranscriptionStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminStatisticsService } from './admin-statistics.service';

describe('AdminStatisticsService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns totals, period metrics, distributions and a daily series', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-25T12:00:00Z'));
    const prisma = {
      user: {
        count: jest
          .fn()
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(8)
          .mockResolvedValueOnce(2),
        groupBy: jest.fn().mockResolvedValue([
          { status: UserStatus.ACTIVE, _count: { _all: 8 } },
          { status: UserStatus.SUSPENDED, _count: { _all: 2 } },
        ]),
      },
      post: {
        count: jest.fn().mockResolvedValueOnce(20).mockResolvedValueOnce(5),
      },
      comment: {
        count: jest.fn().mockResolvedValueOnce(30).mockResolvedValueOnce(7),
      },
      postReport: {
        count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(4),
      },
      upload: {
        count: jest.fn().mockResolvedValueOnce(6).mockResolvedValueOnce(1),
      },
      transcription: {
        count: jest.fn().mockResolvedValueOnce(9).mockResolvedValueOnce(2),
        groupBy: jest.fn().mockResolvedValue([
          {
            status: TranscriptionStatus.COMPLETED,
            _count: { _all: 9 },
          },
        ]),
      },
      chordTranscription: { count: jest.fn().mockResolvedValue(11) },
      playlist: { count: jest.fn().mockResolvedValue(4) },
      catalogTrack: { count: jest.fn().mockResolvedValue(12) },
      listeningHistory: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { playCount: 42 } }),
        groupBy: jest.fn().mockResolvedValue([
          { provider: MusicProvider.YOUTUBE, _sum: { playCount: 31 } },
          { provider: MusicProvider.AUDIUS, _sum: { playCount: 11 } },
        ]),
      },
      auditLog: { count: jest.fn().mockResolvedValue(13) },
      $queryRaw: jest.fn().mockResolvedValue([
        {
          date: '2026-09-25',
          users: 2n,
          posts: 5n,
          comments: 7n,
          reports: 4n,
          trackPlays: 13n,
        },
      ]),
    } as unknown as PrismaService;

    const result = await new AdminStatisticsService(prisma).getDashboard(3);

    expect(result.days).toBe(7);
    expect(result.periodStart).toEqual(new Date('2026-09-19T00:00:00Z'));
    expect(result.totals).toEqual({
      users: 10,
      activeUsers: 8,
      posts: 20,
      comments: 30,
      openReports: 3,
      uploads: 6,
      transcriptions: 9,
      chordTranscriptions: 11,
      playlists: 4,
      catalogTracks: 12,
      trackPlays: 42,
    });
    expect(result.period).toEqual({
      newUsers: 2,
      newPosts: 5,
      newComments: 7,
      newUploads: 1,
      newTranscriptions: 2,
      reportsCreated: 4,
      trackPlays: 13,
    });
    expect(result.daily).toEqual([
      {
        date: '2026-09-25',
        users: 2,
        posts: 5,
        comments: 7,
        reports: 4,
        trackPlays: 13,
      },
    ]);
    expect(result.usersByStatus).toContainEqual({ key: 'ACTIVE', count: 8 });
    expect(result.transcriptionsByStatus).toEqual([
      { key: 'COMPLETED', count: 9 },
    ]);
    expect(result.playsByProvider).toEqual([
      { key: 'YOUTUBE', count: 31 },
      { key: 'AUDIUS', count: 11 },
    ]);
  });
});
