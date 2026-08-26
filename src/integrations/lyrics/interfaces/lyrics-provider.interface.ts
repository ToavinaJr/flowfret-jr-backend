import type { Lyrics, TrackMetadata } from './lyrics.interface';

export interface LyricsProvider {
  findLyrics(track: TrackMetadata): Promise<Lyrics | null>;
}
