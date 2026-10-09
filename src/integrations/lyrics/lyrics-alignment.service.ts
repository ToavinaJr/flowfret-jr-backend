import { Injectable, Logger } from '@nestjs/common';
import type { MusicProvider } from '@prisma/client';
import type { TranscriptionSegment } from '../../transcriptions/entities/transcription.types';
import { buildLyricsCacheKey } from './lyrics-cache-key.util';
import { LyricsCacheService } from './lyrics-cache.service';
import {
  LYRICS_ALIGNMENT_MIN_MATCH_RATIO,
  LYRICS_CACHE_TTL_SECONDS,
} from './lyrics.constants';
import { GeniusLyricsProvider } from './providers/genius-lyrics.provider';
import type { LyricLine, TrackMetadata } from './interfaces/lyrics.interface';

interface AsrWord {
  text: string;
  startMs: number;
}

interface UpgradeInput {
  provider: MusicProvider;
  trackId: string;
  title?: string;
  artist?: string;
  duration?: number;
  segments: TranscriptionSegment[];
}

const SECTION_HEADER_PATTERN = /^\[.*]$/;
const TOKEN_SPLIT_PATTERN = /\s+/;
const MIN_TOKEN_SIMILARITY = 0.7;
const GAP_PENALTY = -1;

/**
 * Upgrades unsynced Genius lyrics to timestamped lines by aligning them
 * against the word-level ASR output the transcription pipeline already
 * produces for a track's vocals (faster-whisper word_timestamps).
 */
@Injectable()
export class LyricsAlignmentService {
  private readonly logger = new Logger(LyricsAlignmentService.name);

  constructor(
    private readonly cache: LyricsCacheService,
    private readonly geniusLyrics: GeniusLyricsProvider,
  ) {}

  async upgradeAfterTranscription(input: UpgradeInput): Promise<void> {
    const { provider, trackId, title, artist, duration, segments } = input;
    if (!title || !artist || segments.length === 0) return;

    const track: TrackMetadata = {
      provider,
      id: trackId,
      title,
      artist,
      duration,
    };
    const key = buildLyricsCacheKey(track);
    const current = await this.cache.get(key);
    if (current?.synced) return;

    const plainLyrics =
      current?.plainLyrics ?? (await this.fetchPlainLyrics(track));
    if (!plainLyrics) return;

    const asrWords = this.flattenWords(segments);
    if (asrWords.length === 0) return;

    const lines = plainLyrics
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const aligned = this.align(lines, asrWords);
    if (!aligned) return;

    await this.cache.set(
      key,
      {
        provider: 'genius',
        synced: true,
        instrumental: false,
        plainLyrics,
        lines: aligned,
      },
      LYRICS_CACHE_TTL_SECONDS,
    );
    this.logger.log(
      `Lyrics synced via Whisper alignment for ${artist} - ${title}`,
    );
  }

  align(lines: string[], asrWords: AsrWord[]): LyricLine[] | null {
    const tokens: Array<{ lineIndex: number; text: string }> = [];
    lines.forEach((line, lineIndex) => {
      if (SECTION_HEADER_PATTERN.test(line)) return;
      for (const raw of line.split(TOKEN_SPLIT_PATTERN)) {
        const normalized = this.normalize(raw);
        if (normalized) tokens.push({ lineIndex, text: normalized });
      }
    });
    if (tokens.length === 0) return null;

    const n = tokens.length;
    const m = asrWords.length;
    const score: Float64Array[] = Array.from(
      { length: n + 1 },
      () => new Float64Array(m + 1),
    );
    const trace: Uint8Array[] = Array.from(
      { length: n + 1 },
      () => new Uint8Array(m + 1),
    );
    for (let i = 1; i <= n; i++) {
      score[i][0] = score[i - 1][0] + GAP_PENALTY;
      trace[i][0] = 1;
    }
    for (let j = 1; j <= m; j++) {
      score[0][j] = score[0][j - 1] + GAP_PENALTY;
      trace[0][j] = 2;
    }
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const similarity = this.similarity(
          tokens[i - 1].text,
          asrWords[j - 1].text,
        );
        const matchScore =
          similarity >= MIN_TOKEN_SIMILARITY ? 2 * similarity : -1;
        const diag = score[i - 1][j - 1] + matchScore;
        const up = score[i - 1][j] + GAP_PENALTY;
        const left = score[i][j - 1] + GAP_PENALTY;
        if (diag >= up && diag >= left) {
          score[i][j] = diag;
          trace[i][j] = 0;
        } else if (up >= left) {
          score[i][j] = up;
          trace[i][j] = 1;
        } else {
          score[i][j] = left;
          trace[i][j] = 2;
        }
      }
    }

    const lineStartMs = new Map<number, number>();
    let matchedTokens = 0;
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      const direction = trace[i][j];
      if (direction === 0) {
        const similarity = this.similarity(
          tokens[i - 1].text,
          asrWords[j - 1].text,
        );
        if (similarity >= MIN_TOKEN_SIMILARITY) {
          matchedTokens += 1;
          const lineIndex = tokens[i - 1].lineIndex;
          const candidate = asrWords[j - 1].startMs;
          const existing = lineStartMs.get(lineIndex);
          if (existing === undefined || candidate < existing)
            lineStartMs.set(lineIndex, candidate);
        }
        i -= 1;
        j -= 1;
      } else if (direction === 1) {
        i -= 1;
      } else {
        j -= 1;
      }
    }

    if (matchedTokens / tokens.length < LYRICS_ALIGNMENT_MIN_MATCH_RATIO)
      return null;

    return this.interpolate(lines, lineStartMs);
  }

  private async fetchPlainLyrics(
    track: TrackMetadata,
  ): Promise<string | undefined> {
    try {
      const result = await this.geniusLyrics.findLyrics(track);
      return result?.plainLyrics;
    } catch {
      return undefined;
    }
  }

  private flattenWords(segments: TranscriptionSegment[]): AsrWord[] {
    const words: AsrWord[] = [];
    for (const segment of segments) {
      for (const word of segment.words ?? []) {
        const normalized = this.normalize(word.text);
        if (normalized)
          words.push({
            text: normalized,
            startMs: Math.round(word.start * 1000),
          });
      }
    }
    return words;
  }

  private interpolate(
    lines: string[],
    lineStartMs: Map<number, number>,
  ): LyricLine[] {
    const known: Array<number | null> = lines.map(
      (_, index) => lineStartMs.get(index) ?? null,
    );
    const filled: Array<number | null> = [...known];
    for (let index = 0; index < filled.length; index++) {
      if (known[index] !== null) continue;
      const prevIndex = this.findKnown(known, index, -1);
      const nextIndex = this.findKnown(known, index, 1);
      if (prevIndex === -1 && nextIndex === -1) continue;
      if (prevIndex === -1) {
        filled[index] = known[nextIndex];
        continue;
      }
      if (nextIndex === -1) {
        filled[index] = known[prevIndex];
        continue;
      }
      const prevMs = known[prevIndex] as number;
      const nextMs = known[nextIndex] as number;
      const ratio = (index - prevIndex) / (nextIndex - prevIndex);
      filled[index] = Math.round(prevMs + (nextMs - prevMs) * ratio);
    }
    return lines.map((text, index) => ({ startTimeMs: filled[index], text }));
  }

  private findKnown(
    values: Array<number | null>,
    from: number,
    direction: 1 | -1,
  ): number {
    for (
      let index = from + direction;
      index >= 0 && index < values.length;
      index += direction
    ) {
      if (values[index] !== null) return index;
    }
    return -1;
  }

  private similarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a || !b) return 0;
    const distance = this.levenshtein(a, b);
    return 1 - distance / Math.max(a.length, b.length);
  }

  private levenshtein(a: string, b: string): number {
    const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
      new Array<number>(b.length + 1).fill(0),
    );
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
      }
    }
    return dp[a.length][b.length];
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '')
      .trim();
  }
}
