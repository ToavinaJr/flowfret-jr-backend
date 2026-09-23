import { PolicyViolationError } from './policy-violation.error';

export const transcriptionPolicy = {
  assertCanAccess(hasAccess: boolean): void {
    if (!hasAccess) {
      throw new PolicyViolationError('TRANSCRIPTION_FORBIDDEN');
    }
  },
};
