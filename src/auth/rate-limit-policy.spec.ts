import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';
import { AuditLogsResolver } from '../audit-logs/audit-logs.resolver';
import { NotificationsResolver } from '../notifications/notifications.resolver';
import { PostInteractionsResolver } from '../post-interactions/post-interactions.resolver';
import { ProfilesResolver } from '../profiles/profiles.resolver';
import { TeachingResolver } from '../teaching/teaching.resolver';
import { TeachingLessonsResolver } from '../teaching/teaching-lessons.resolver';
import { TeachingMaterialsResolver } from '../teaching/teaching-materials.resolver';
import { TeachingProfilesResolver } from '../teaching/teaching-profiles.resolver';

const guardedResolvers = [
  PostInteractionsResolver,
  ProfilesResolver,
  NotificationsResolver,
  TeachingResolver,
  TeachingProfilesResolver,
  TeachingMaterialsResolver,
  TeachingLessonsResolver,
];

describe('default mutation rate-limit policies', () => {
  const reflector = new Reflector();

  it.each(guardedResolvers)('%s limits every resolver operation', (resolver) => {
    const methodNames = Object.getOwnPropertyNames(resolver.prototype).filter(
      (name) => name !== 'constructor',
    );

    for (const methodName of methodNames) {
      const handler = resolver.prototype[methodName] as (...args: never[]) => unknown;
      const policies = reflector.getAllAndOverride<RateLimitOptions[]>(
        RATE_LIMIT_KEY,
        [handler, resolver],
      );

      expect(policies).toEqual([
        { limit: 120, windowSeconds: 60, failClosed: true },
      ]);
    }
  });

  it('applies a stricter limit to recordActivity', () => {
    const policy = reflector.get<RateLimitOptions[]>(
      RATE_LIMIT_KEY,
      AuditLogsResolver.prototype.recordActivity,
    );

    expect(policy).toEqual([
      { limit: 30, windowSeconds: 60, failClosed: true },
    ]);
  });
});
