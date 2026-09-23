import { ProfileVisibility } from '@prisma/client';
import { PolicyViolationError } from './policy-violation.error';

type ProfileSubject = {
  userId: string;
  visibility: ProfileVisibility;
};

export const profilePolicy = {
  canView(
    actorId: string,
    profile: ProfileSubject,
    areFriends: boolean,
  ): boolean {
    return (
      profile.userId === actorId ||
      profile.visibility === ProfileVisibility.PUBLIC ||
      (profile.visibility === ProfileVisibility.FRIENDS && areFriends)
    );
  },

  assertCanMutate(
    actorId: string,
    profile: Pick<ProfileSubject, 'userId'>,
  ): void {
    if (profile.userId !== actorId) {
      throw new PolicyViolationError('PROFILE_FORBIDDEN');
    }
  },
};
