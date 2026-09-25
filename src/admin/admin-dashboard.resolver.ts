import { Args, Query, Resolver } from '@nestjs/graphql';
import { UserRole } from '@prisma/client';
import { RateLimit } from '../auth/rate-limit.decorator';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AdminStatisticsService } from './admin-statistics.service';
import {
  AdminBackendStatus,
  AdminDashboardStatistics,
  AdminStatisticsInput,
} from './admin.types';

@Roles(UserRole.ADMIN)
@Resolver()
export class AdminDashboardResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statistics: AdminStatisticsService,
  ) {}

  @Query(() => AdminBackendStatus, { name: 'adminBackendStatus' })
  async status(): Promise<AdminBackendStatus> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { databaseReachable: true, serverTime: new Date() };
  }

  @RateLimit(30, 60, true)
  @Query(() => AdminDashboardStatistics, { name: 'adminDashboardStatistics' })
  dashboardStatistics(
    @Args('input', { type: () => AdminStatisticsInput, nullable: true })
    input?: AdminStatisticsInput,
  ): Promise<AdminDashboardStatistics> {
    return this.statistics.getDashboard(input?.days ?? 30);
  }
}
