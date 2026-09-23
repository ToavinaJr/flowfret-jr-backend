import { PolicyViolationError } from './policy-violation.error';

type OwnedPost = { authorId: string };

export const postPolicy = {
  assertCanMutate(actorId: string, post: OwnedPost): void {
    if (post.authorId !== actorId) {
      throw new PolicyViolationError('POST_FORBIDDEN');
    }
  },
};
