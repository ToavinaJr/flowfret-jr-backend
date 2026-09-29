import { Module } from '@nestjs/common';
import { AdminAuditResolver } from './admin-audit.resolver';
import { AdminContentResolver } from './admin-content.resolver';
import { AdminDashboardResolver } from './admin-dashboard.resolver';
import { AdminMediaResolver } from './admin-media.resolver';
import { AdminMusicResolver } from './admin-music.resolver';
import { AdminUsersResolver } from './admin-users.resolver';
import { AdminSecurityResolver } from './admin-security.resolver';
import { AdminSecurityService } from './admin-security.service';
import { AdminStatisticsService } from './admin-statistics.service';
import { AdminUserActivityResolver } from './admin-user-activity.resolver';

@Module({
  providers: [
    AdminDashboardResolver,
    AdminUsersResolver,
    AdminUserActivityResolver,
    AdminContentResolver,
    AdminMediaResolver,
    AdminMusicResolver,
    AdminAuditResolver,
    AdminSecurityResolver,
    AdminSecurityService,
    AdminStatisticsService,
  ],
})
export class AdminModule {}
