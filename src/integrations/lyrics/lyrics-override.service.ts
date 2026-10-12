import { Injectable } from '@nestjs/common';
import { LyricsOverride } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildLyricsCacheKey } from './lyrics-cache-key.util';
import { LyricsCacheService } from './lyrics-cache.service';
import { LyricsReportsService } from './lyrics-reports.service';
import { LYRICS_CACHE_TTL_SECONDS } from './lyrics.constants';
import type { Lyrics, LyricLine } from './interfaces/lyrics.interface';

export interface LyricsOverrideInput {
  provider: string;
  trackId: string;
  title: string;
  artist: string;
  lines: LyricLine[];
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
    const { provider, trackId, title, artist } = input;
    const lines = input.lines
      .map((line) => ({ ...line, text: line.text.trim() }))
      .filter((line) => line.text.length > 0);
    const plainLyrics = lines.map((line) => line.text).join('\n');
    const synced = lines.some((line) => line.startTimeMs !== null);

    const override = await this.prisma.lyricsOverride.upsert({
      where: { provider_trackId: { provider, trackId } },
      create: {
        provider,
        trackId,
        title,
        artist,
        plainLyrics,
        synced,
        lines,
        updatedByUserId,
      },
      update: {
        title,
        artist,
        plainLyrics,
        synced,
        lines,
        updatedByUserId,
      },
    });

    const key = buildLyricsCacheKey({ provider, id: trackId, title, artist });
    const result: Lyrics = {
      provider: 'override',
      synced,
      instrumental: false,
      plainLyrics,
      lines,
    };
    await this.cache.set(key, result, LYRICS_CACHE_TTL_SECONDS);
    await this.reports.resolveOpenReportsFor(provider, trackId);

    return override;
  }
}
