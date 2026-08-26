export interface TrackMetadata {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  isrc?: string;
  provider?: string;
}

export interface LyricLine {
  startTimeMs: number | null;
  text: string;
}

export interface Lyrics {
  provider: string;
  synced: boolean;
  instrumental: boolean;
  plainLyrics?: string;
  lines: LyricLine[];
}
