import { buildLyricsSearchCandidates } from './lyrics-search-candidates.util';

describe('buildLyricsSearchCandidates', () => {
  it('only strips bracketed noise for non-YouTube providers, without splitting', () => {
    expect(
      buildLyricsSearchCandidates({
        title: 'Song Title [Official Audio]',
        artist: 'Real Artist',
        provider: 'AUDIUS',
      }),
    ).toEqual([
      {
        title: 'Song Title',
        artist: 'Real Artist',
        provider: 'AUDIUS',
      },
    ]);
  });

  it('tries both artist/title orderings for a dashed YouTube title', () => {
    expect(
      buildLyricsSearchCandidates({
        title: 'TSOTA - AOKA [clip Gasy]',
        artist: 'Some Channel',
        provider: 'YOUTUBE',
      }),
    ).toEqual([
      {
        title: 'AOKA',
        artist: 'TSOTA',
        provider: 'YOUTUBE',
      },
      {
        title: 'TSOTA',
        artist: 'AOKA',
        provider: 'YOUTUBE',
      },
    ]);
  });

  it('keeps extra dash segments on the title side', () => {
    expect(
      buildLyricsSearchCandidates({
        title: 'Artist - Title - Remix',
        artist: 'Channel',
        provider: 'YOUTUBE',
      }),
    ).toEqual([
      { title: 'Title - Remix', artist: 'Artist', provider: 'YOUTUBE' },
      { title: 'Artist', artist: 'Title - Remix', provider: 'YOUTUBE' },
    ]);
  });

  it('falls back to the cleaned title alone when there is no dash', () => {
    expect(
      buildLyricsSearchCandidates({
        title: 'OneWordTitle (Clip Officiel)',
        artist: 'Channel',
        provider: 'YOUTUBE',
      }),
    ).toEqual([
      { title: 'OneWordTitle', artist: 'Channel', provider: 'YOUTUBE' },
    ]);
  });
});
