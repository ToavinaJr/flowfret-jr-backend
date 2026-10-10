import { estimateLyricsTiming } from './estimate-lyrics-timing.util';

describe('estimateLyricsTiming', () => {
  it('assigns timestamps in increasing order starting at 0', () => {
    const result = estimateLyricsTiming(
      ['Line one', 'Line two', 'A much longer third line here'],
      120,
    );
    expect(result).toHaveLength(3);
    expect(result[0].startTimeMs).toBe(0);
    expect(result[1].startTimeMs).toBeGreaterThan(result[0].startTimeMs!);
    expect(result[2].startTimeMs).toBeGreaterThan(result[1].startTimeMs!);
    expect(result[2].startTimeMs!).toBeLessThan(120_000);
  });

  it('gives longer lines a proportionally later-starting share of the duration', () => {
    const short = estimateLyricsTiming(['a', 'a long line', 'z'], 60);
    // the gap before the third (short) line reflects the long middle line's weight
    expect(short[2].startTimeMs! - short[1].startTimeMs!).toBeGreaterThan(
      short[1].startTimeMs! - short[0].startTimeMs!,
    );
  });

  it('preserves line text unchanged', () => {
    const result = estimateLyricsTiming(['Hello', 'World'], 10);
    expect(result.map((line) => line.text)).toEqual(['Hello', 'World']);
  });

  it('handles a single line', () => {
    expect(estimateLyricsTiming(['Only line'], 30)).toEqual([
      { startTimeMs: 0, text: 'Only line' },
    ]);
  });
});
