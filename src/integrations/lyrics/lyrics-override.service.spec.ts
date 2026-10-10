import type { PrismaService } from '../../prisma/prisma.service';
import { buildLyricsCacheKey } from './lyrics-cache-key.util';
import type { LyricsCacheService } from './lyrics-cache.service';
import { LyricsOverrideService } from './lyrics-override.service';
import type { LyricsReportsService } from './lyrics-reports.service';

describe('LyricsOverrideService', () => {
  const prisma = {
    lyricsOverride: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  const cache = { get: jest.fn(), set: jest.fn() };
  const reports = { resolveOpenReportsFor: jest.fn() };
  let service: LyricsOverrideService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LyricsOverrideService(
      prisma as unknown as PrismaService,
      cache as unknown as LyricsCacheService,
      reports as unknown as LyricsReportsService,
    );
  });

  it('finds an override by provider and trackId', async () => {
    prisma.lyricsOverride.findUnique.mockResolvedValue({ id: 'override-1' });
    await service.find('YOUTUBE', 'abc');
    expect(prisma.lyricsOverride.findUnique).toHaveBeenCalledWith({
      where: { provider_trackId: { provider: 'YOUTUBE', trackId: 'abc' } },
    });
  });

  it('splits plainLyrics into trimmed non-empty lines, upserts, writes through the cache and resolves open reports', async () => {
    prisma.lyricsOverride.upsert.mockResolvedValue({ id: 'override-1' });
    const input = {
      provider: 'YOUTUBE',
      trackId: 'abc',
      title: 'Song',
      artist: 'Artist',
      plainLyrics: '  Line one  \n\n  Line two  \n',
    };

    await service.save(input, 'admin-1');

    const upsertCalls = prisma.lyricsOverride.upsert.mock.calls as Array<
      [
        {
          where: unknown;
          create: { lines: string[]; updatedByUserId: string };
          update: { lines: string[]; updatedByUserId: string };
        },
      ]
    >;
    const upsertCall = upsertCalls[0][0];
    expect(upsertCall.where).toEqual({
      provider_trackId: { provider: 'YOUTUBE', trackId: 'abc' },
    });
    expect(upsertCall.create.lines).toEqual(['Line one', 'Line two']);
    expect(upsertCall.create.updatedByUserId).toBe('admin-1');
    expect(upsertCall.update.lines).toEqual(['Line one', 'Line two']);
    expect(upsertCall.update.updatedByUserId).toBe('admin-1');

    const key = buildLyricsCacheKey({
      provider: 'YOUTUBE',
      id: 'abc',
      title: 'Song',
      artist: 'Artist',
    });
    const [cacheKey, cacheValue, cacheTtl] = cache.set.mock.calls[0] as [
      string,
      {
        provider: string;
        synced: boolean;
        plainLyrics: string;
        lines: Array<{ startTimeMs: number | null; text: string }>;
      },
      number,
    ];
    expect(cacheKey).toBe(key);
    expect(cacheValue.provider).toBe('override');
    expect(cacheValue.synced).toBe(false);
    expect(cacheValue.plainLyrics).toBe(input.plainLyrics);
    expect(cacheValue.lines).toEqual([
      { startTimeMs: null, text: 'Line one' },
      { startTimeMs: null, text: 'Line two' },
    ]);
    expect(typeof cacheTtl).toBe('number');
    expect(reports.resolveOpenReportsFor).toHaveBeenCalledWith(
      'YOUTUBE',
      'abc',
    );
  });
});
