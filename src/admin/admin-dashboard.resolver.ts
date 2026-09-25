import { Query, Resolver } from '@nestjs/graphql';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AdminBackendStatus } from './admin.types';

@Roles(UserRole.ADMIN)
@Resolver()
export class AdminDashboardResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => AdminBackendStatus, { name: 'adminBackendStatus' })
  async status(): Promise<AdminBackendStatus> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { databaseReachable: true, serverTime: new Date() };
  }
}
