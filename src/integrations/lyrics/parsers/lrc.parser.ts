import type { LyricLine } from '../interfaces/lyrics.interface';

const TIMESTAMP = /\[(\d{1,3}):(\d{2})[.:](\d{2,3})\]/g;

export function parseLrc(value: string | null | undefined): LyricLine[] {
  if (!value) return [];
  const lines: LyricLine[] = [];

  for (const rawLine of value.split(/\r?\n/)) {
    TIMESTAMP.lastIndex = 0;
    const matches = [...rawLine.matchAll(TIMESTAMP)];
    if (matches.length === 0) continue;
    const text = rawLine.replace(TIMESTAMP, '').trim();

    for (const match of matches) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      if (seconds >= 60) continue;
      const fraction =
        match[3].length === 2 ? Number(match[3]) * 10 : Number(match[3]);
      lines.push({
        startTimeMs: (minutes * 60 + seconds) * 1000 + fraction,
        text,
      });
    }
  }

  return lines.sort(
    (left, right) => (left.startTimeMs ?? 0) - (right.startTimeMs ?? 0),
  );
}
