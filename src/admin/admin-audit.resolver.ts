import { Args, Query, Resolver } from '@nestjs/graphql';
import { Prisma, UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RateLimit } from '../auth/rate-limit.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { buildAdminPage, decodeAdminPage } from './admin-pagination';
import {
  AdminAuditInput,
  AdminAuditLogConnection,
  AdminSortDirection,
} from './admin.types';

@RateLimit(120, 60, true)
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
    const from = input?.from ? new Date(input.from) : undefined;
    const to = input?.to
      ? new Date(
          /^\d{4}-\d{2}-\d{2}$/.test(input.to)
            ? `${input.to}T23:59:59.999Z`
            : input.to,
        )
      : undefined;
    const searchConditions: Prisma.AuditLogWhereInput[] = search
      ? [
          { action: { contains: search, mode: 'insensitive' } },
          { entityType: { contains: search, mode: 'insensitive' } },
          { actor: { username: { contains: search, mode: 'insensitive' } } },
          ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            search,
          )
            ? [{ entityId: search }, { actorId: search }]
            : []),
        ]
      : [];
    const where: Prisma.AuditLogWhereInput = {
      ...(input?.includeDeleted ? {} : { isDeleted: false }),
      ...(input?.actorId ? { actorId: input.actorId } : {}),
      ...(input?.action
        ? { action: { equals: input.action, mode: 'insensitive' } }
        : {}),
      ...(input?.entityType
        ? { entityType: { equals: input.entityType, mode: 'insensitive' } }
        : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(search ? { OR: searchConditions } : {}),
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
