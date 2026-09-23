import { ProfileVisibility } from '@prisma/client';
import { commentPolicy } from './comment.policy';
import { playlistPolicy } from './playlist.policy';
import { PolicyViolationError } from './policy-violation.error';
import { postPolicy } from './post.policy';
import { profilePolicy } from './profile.policy';

describe('object authorization policies', () => {
  it('rejects mutations performed by a different owner', () => {
    expect(() => postPolicy.assertCanMutate('a', { authorId: 'b' })).toThrow(
      PolicyViolationError,
    );
    expect(() => commentPolicy.assertCanMutate('a', { authorId: 'b' })).toThrow(
      PolicyViolationError,
    );
    expect(() => playlistPolicy.assertCanManage('a', { userId: 'b' })).toThrow(
      PolicyViolationError,
    );
  });

  it('allows a friends-only profile only to its owner or a friend', () => {
    const profile = {
      userId: 'owner',
      visibility: ProfileVisibility.FRIENDS,
    };
    expect(profilePolicy.canView('stranger', profile, false)).toBe(false);
    expect(profilePolicy.canView('friend', profile, true)).toBe(true);
    expect(profilePolicy.canView('owner', profile, false)).toBe(true);
  });
});
