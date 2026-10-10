import type { LyricLine } from './interfaces/lyrics.interface';

/**
 * Approximates per-line timestamps by distributing a track's known duration
 * across its lyric lines, weighted by each line's character count (longer
 * lines get proportionally more time). This is NOT real audio-based
 * synchronization — there is no ASR/alignment step feeding it — so it's a
 * best-effort estimate used only when no real timing source is available.
 * Lines will drift from the actual singing rhythm, especially around
 * instrumental intros, solos and outros.
 */
export function estimateLyricsTiming(
  lines: string[],
  durationSeconds: number,
): LyricLine[] {
  const weights = lines.map((line) => Math.max(1, line.trim().length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const durationMs = durationSeconds * 1000;
  let elapsed = 0;
  return lines.map((text, index) => {
    const startTimeMs = Math.round((elapsed / totalWeight) * durationMs);
    elapsed += weights[index];
    return { startTimeMs, text };
  });
}
