import { PolicyViolationError } from './policy-violation.error';

export const playlistPolicy = {
  assertCanManage(actorId: string, playlist: { userId: string }): void {
    if (playlist.userId !== actorId) {
      throw new PolicyViolationError('PLAYLIST_FORBIDDEN');
    }
  },
};
