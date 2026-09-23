import { PolicyViolationError } from './policy-violation.error';

type OwnedComment = { authorId: string };

export const commentPolicy = {
  assertCanMutate(actorId: string, comment: OwnedComment): void {
    if (comment.authorId !== actorId) {
      throw new PolicyViolationError('COMMENT_FORBIDDEN');
    }
  },
};
