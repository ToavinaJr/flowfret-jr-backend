import { PolicyViolationError } from './policy-violation.error';

export const uploadPolicy = {
  assertCanManage(actorId: string, upload: { userId: string }): void {
    if (upload.userId !== actorId) {
      throw new PolicyViolationError('UPLOAD_FORBIDDEN');
    }
  },
};
