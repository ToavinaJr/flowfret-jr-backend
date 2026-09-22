import { extractPostTags } from './post-tags';

describe('extractPostTags', () => {
  it('normalizes and deduplicates product tags', () => {
    expect(extractPostTags('Solo @Blues puis @blues et @Rock_70')).toEqual([
      'blues',
      'rock_70',
    ]);
  });

  it('does not interpret email addresses as tags', () => {
    expect(extractPostTags('Écrivez à music@example.com avec @alice')).toEqual([
      'alice',
    ]);
  });

  it('limits a post to ten tags', () => {
    const content = Array.from(
      { length: 15 },
      (_, index) => `@tag${index}`,
    ).join(' ');
    expect(extractPostTags(content)).toHaveLength(10);
  });
});
