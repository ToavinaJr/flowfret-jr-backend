import type { TrackMetadata } from './interfaces/lyrics.interface';

const BRACKETED_NOISE_PATTERN = /[[(][^\])]*[\])]/g;

function stripBracketedNoise(value: string): string {
  return value
    .replace(BRACKETED_NOISE_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Raw YouTube video titles commonly bake the artist into the title itself
 * ("Artist - Title [Clip Officiel]"), with only an unreliable uploader
 * channel name as the "artist" field. Lyrics providers need a clean,
 * separate (title, artist) pair, so for YouTube tracks whose title
 * contains a dash, both possible splits are tried in turn — there's no way
 * to know up front which side is the artist. Other providers (Audius,
 * Spotify) already give clean, separately-tracked fields, so only bracket
 * noise is stripped there, to avoid misreading a title that legitimately
 * contains a dash as an "Artist - Title" pair.
 */
export function buildLyricsSearchCandidates(
  track: TrackMetadata,
): TrackMetadata[] {
  const cleanedTitle = stripBracketedNoise(track.title) || track.title;
  if (track.provider !== 'YOUTUBE') {
    return [{ ...track, title: cleanedTitle }];
  }

  const [first, ...rest] = cleanedTitle.split(/\s*-\s*/).filter(Boolean);
  if (!first || rest.length === 0) {
    return [{ ...track, title: cleanedTitle }];
  }
  const second = rest.join(' - ');
  return [
    { ...track, artist: first, title: second },
    { ...track, artist: second, title: first },
  ];
}
