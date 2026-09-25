import { Args, Query, Resolver } from '@nestjs/graphql';
import { Prisma, UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { buildAdminPage, decodeAdminPage } from './admin-pagination';
import {
  AdminAuditInput,
  AdminAuditLogConnection,
  AdminSortDirection,
} from './admin.types';

@Roles(UserRole.ADMIN)
@Resolver()
export class AdminAuditResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => AdminAuditLogConnection, { name: 'adminAuditLogs' })
  async auditLogs(
    @Args('input', { type: () => AdminAuditInput, nullable: true })
    input?: AdminAuditInput,
  ): Promise<AdminAuditLogConnection> {
    const page = decodeAdminPage(input);
    const search = input?.search?.trim();
    const where: Prisma.AuditLogWhereInput = {
      ...(input?.includeDeleted ? {} : { isDeleted: false }),
      ...(input?.actorId ? { actorId: input.actorId } : {}),
      ...(input?.action
        ? { action: { equals: input.action, mode: 'insensitive' } }
        : {}),
      ...(input?.entityType
        ? { entityType: { equals: input.entityType, mode: 'insensitive' } }
        : {}),
      ...(search
        ? {
            OR: [
              { action: { contains: search, mode: 'insensitive' } },
              { entityType: { contains: search, mode: 'insensitive' } },
              {
                actor: {
                  username: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const direction: Prisma.SortOrder =
      input?.direction === AdminSortDirection.ASC ? 'asc' : 'desc';
    const [rows, totalCount] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: page.skip,
        take: page.take + 1,
        orderBy: [{ createdAt: direction }, { id: direction }],
        include: { actor: { select: { username: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return buildAdminPage(
      rows.map((row) => ({
        ...row,
        actorUsername: row.actor.username,
      })),
      totalCount,
      page,
    );
  }
}
