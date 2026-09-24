import { MusicProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListeningHistoryService } from './listening-history.service';

const track = {
  provider: MusicProvider.YOUTUBE,
  providerTrackId: 'video-id',
  title: 'Song',
  artists: [{ id: 'channel-id', name: 'Artist' }],
  imageUrl: 'https://images.example.com/cover.jpg',
  externalUrl: 'https://www.youtube.com/watch?v=video-id',
  streamUrl: 'https://www.youtube.com/watch?v=video-id',
  album: null,
  genre: null,
  isrc: null,
  durationMs: 120_000,
};

describe('ListeningHistoryService', () => {
  it('upserts a user track and increments its play count', async () => {
    const prisma = {
      listeningHistory: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const service = new ListeningHistoryService(
      prisma as unknown as PrismaService,
    );

    await expect(service.record('user-id', track)).resolves.toBe(true);
    expect(prisma.listeningHistory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_provider_providerTrackId: {
            userId: 'user-id',
            provider: MusicProvider.YOUTUBE,
            providerTrackId: 'video-id',
          },
        },
        update: expect.objectContaining({ playCount: { increment: 1 } }),
      }),
    );
  });

  it('returns the most recently played tracks as playable music tracks', async () => {
    const prisma = {
      listeningHistory: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...track,
            id: 'history-id',
            userId: 'user-id',
            playCount: 2,
            lastPlayedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      },
    };
    const service = new ListeningHistoryService(
      prisma as unknown as PrismaService,
    );

    await expect(service.list('user-id', 20)).resolves.toEqual([
      expect.objectContaining({
        providerTrackId: 'video-id',
        streamUrl: track.streamUrl,
        artists: track.artists,
      }),
    ]);
  });
});
