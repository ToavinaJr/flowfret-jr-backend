import { parseLrc } from './lrc.parser';

describe('parseLrc', () => {
  it('parses two and three digit fractions and sorts lines', () => {
    expect(
      parseLrc('[01:02.25]Third\n[00:12.400]Second\n[00:12.40]First'),
    ).toEqual([
      { startTimeMs: 12400, text: 'Second' },
      { startTimeMs: 12400, text: 'First' },
      { startTimeMs: 62250, text: 'Third' },
    ]);
  });

  it('supports empty text, multiple timestamps and ignores invalid lines', () => {
    expect(
      parseLrc('metadata\n[00:05.00][00:06.000] Repeat\n[00:07.00]'),
    ).toEqual([
      { startTimeMs: 5000, text: 'Repeat' },
      { startTimeMs: 6000, text: 'Repeat' },
      { startTimeMs: 7000, text: '' },
    ]);
    expect(parseLrc(null)).toEqual([]);
  });
});
