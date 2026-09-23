import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { BadRequestException } from '@nestjs/common';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { AuditLogModel } from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';

/** Audit records are append-only: clients can read their own history, never edit it. */
@Resolver(() => AuditLogModel)
export class AuditLogsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [AuditLogModel], { name: 'myAuditLogs' })
  async myAuditLogs(
    @Context() context: { req: { user: { sub: string } } },
    @Args('take', { type: () => Int, defaultValue: 50 }) take: number,
  ): Promise<AuditLogModel[]> {
    return this.prisma.auditLog.findMany({
      where: { actorId: context.req.user.sub, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, take)),
    });
  }

  /** Records non-mutating product activity such as starting playback. */
  @Mutation(() => AuditLogModel)
  async recordActivity(
    @Args('action') action: string,
    @Args('entityType') entityType: string,
    @Args('entityId', { type: () => String, nullable: true })
    entityId: string | undefined,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<AuditLogModel> {
    if (
      action !== AUDIT_ACTION.TRACK_LISTENED ||
      entityType !== AUDIT_ENTITY.TRACK
    )
      throw new BadRequestException('Activité invalide.');
    if (entityId && entityId.length > 255)
      throw new BadRequestException('Identifiant invalide.');
    return this.prisma.auditLog.create({
      data: {
        actorId: context.req.user.sub,
        action,
        entityType,
        metadata: entityId ? { externalId: entityId } : {},
      },
    });
  }
}
