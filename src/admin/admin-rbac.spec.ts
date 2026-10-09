import 'reflect-metadata';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RATE_LIMIT_KEY } from '../auth/rate-limit.decorator';
import { AdminAuditResolver } from './admin-audit.resolver';
import { AdminContentResolver } from './admin-content.resolver';
import { AdminDashboardResolver } from './admin-dashboard.resolver';
import { AdminMediaResolver } from './admin-media.resolver';
import { AdminMusicResolver } from './admin-music.resolver';
import { AdminUsersResolver } from './admin-users.resolver';
import { AdminSecurityResolver } from './admin-security.resolver';
import { AdminUserActivityResolver } from './admin-user-activity.resolver';
import { AdminEntityResolver } from './admin-entity.resolver';

describe('admin resolver authorization metadata', () => {
  it.each([
    AdminDashboardResolver,
    AdminUsersResolver,
    AdminContentResolver,
    AdminMediaResolver,
    AdminMusicResolver,
    AdminAuditResolver,
    AdminSecurityResolver,
    AdminUserActivityResolver,
    AdminEntityResolver,
  ])('requires ADMIN for %p', (resolver) => {
    expect(Reflect.getMetadata(ROLES_KEY, resolver)).toEqual([UserRole.ADMIN]);
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, resolver)).toEqual([
      { limit: 120, windowSeconds: 60, failClosed: true },
    ]);
  });
});
