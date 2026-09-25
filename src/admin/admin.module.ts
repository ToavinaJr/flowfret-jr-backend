import { Module } from '@nestjs/common';
import { AdminAuditResolver } from './admin-audit.resolver';
import { AdminContentResolver } from './admin-content.resolver';
import { AdminDashboardResolver } from './admin-dashboard.resolver';
import { AdminMediaResolver } from './admin-media.resolver';
import { AdminMusicResolver } from './admin-music.resolver';
import { AdminUsersResolver } from './admin-users.resolver';

@Module({
  providers: [
    AdminDashboardResolver,
    AdminUsersResolver,
    AdminContentResolver,
    AdminMediaResolver,
    AdminMusicResolver,
    AdminAuditResolver,
  ],
})
export class AdminModule {}
