import { extractMentionUsernames } from './mentions';

describe('extractMentionUsernames', () => {
  it('extracts unique usernames while preserving their spelling', () => {
    expect(extractMentionUsernames('@Alice puis @bob et @alice')).toEqual([
      'Alice',
      'bob',
    ]);
  });

  it('does not interpret email addresses as mentions', () => {
    expect(extractMentionUsernames('music@example.com et @alice')).toEqual([
      'alice',
    ]);
  });

  it('limits content to ten mentions', () => {
    expect(
      extractMentionUsernames(
        Array.from({ length: 12 }, (_, index) => `@ami${index}`).join(' '),
      ),
    ).toHaveLength(10);
  });
});
