import { Injectable } from '@nestjs/common';
import { LyricsOverride } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildLyricsCacheKey } from './lyrics-cache-key.util';
import { LyricsCacheService } from './lyrics-cache.service';
import { LyricsReportsService } from './lyrics-reports.service';
import { LYRICS_CACHE_TTL_SECONDS } from './lyrics.constants';
import type { Lyrics } from './interfaces/lyrics.interface';

export interface LyricsOverrideInput {
  provider: string;
  trackId: string;
  title: string;
  artist: string;
  plainLyrics: string;
}

@Injectable()
export class LyricsOverrideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LyricsCacheService,
    private readonly reports: LyricsReportsService,
  ) {}

  find(provider: string, trackId: string): Promise<LyricsOverride | null> {
    return this.prisma.lyricsOverride.findUnique({
      where: { provider_trackId: { provider, trackId } },
    });
  }

  async save(
    input: LyricsOverrideInput,
    updatedByUserId: string,
  ): Promise<LyricsOverride> {
    const { provider, trackId, title, artist, plainLyrics } = input;
    const lines = plainLyrics
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const override = await this.prisma.lyricsOverride.upsert({
      where: { provider_trackId: { provider, trackId } },
      create: {
        provider,
        trackId,
        title,
        artist,
        plainLyrics,
        synced: false,
        lines,
        updatedByUserId,
      },
      update: {
        title,
        artist,
        plainLyrics,
        synced: false,
        lines,
        updatedByUserId,
      },
    });

    const key = buildLyricsCacheKey({ provider, id: trackId, title, artist });
    const result: Lyrics = {
      provider: 'override',
      synced: false,
      instrumental: false,
      plainLyrics,
      lines: lines.map((text) => ({ startTimeMs: null, text })),
    };
    await this.cache.set(key, result, LYRICS_CACHE_TTL_SECONDS);
    await this.reports.resolveOpenReportsFor(provider, trackId);

    return override;
  }
}
