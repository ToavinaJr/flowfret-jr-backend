import { createHash } from 'node:crypto';
import type { TrackMetadata } from './interfaces/lyrics.interface';

export function buildLyricsCacheKey(track: TrackMetadata): string {
  const identity = [
    track.provider,
    track.id,
    track.artist,
    track.title,
    track.duration,
  ]
    .filter((value) => value !== undefined && value !== '')
    .map((value) =>
      String(value)
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim(),
    )
    .join('|');
  return `lyrics:${createHash('sha256').update(identity).digest('hex')}`;
}
