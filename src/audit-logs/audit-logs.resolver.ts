import {
  Args,
  Mutation,
  Parent,
  ResolveField,
  Query,
  Resolver,
} from '@nestjs/graphql';
import {
  AuditLogModel,
  CreateAuditLogInput,
  UpdateAuditLogInput,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => AuditLogModel)
export class AuditLogsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [AuditLogModel], { name: 'auditLogs' })
  async auditLogs(): Promise<AuditLogModel[]> {
    return this.prisma.auditLog.findMany({ where: { isDeleted: false }, orderBy: { createdAt: 'desc' } });
  }

  @Query(() => AuditLogModel, { name: 'auditLog', nullable: true })
  async auditLog(@Args('id') id: string): Promise<AuditLogModel | null> {
    return this.prisma.auditLog.findFirst({ where: { id, isDeleted: false } });
  }

  @Mutation(() => AuditLogModel)
  async createAuditLog(
    @Args('data') data: CreateAuditLogInput,
  ): Promise<AuditLogModel> {
    return this.prisma.auditLog.create({ data });
  }

  @Mutation(() => AuditLogModel)
  async updateAuditLog(
    @Args('id') id: string,
    @Args('data') data: UpdateAuditLogInput,
  ): Promise<AuditLogModel> {
    return this.prisma.auditLog.update({ where: { id }, data });
  }

  @Mutation(() => AuditLogModel)
  async deleteAuditLog(@Args('id') id: string): Promise<AuditLogModel> {
    return this.prisma.auditLog.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
  }

  @ResolveField(() => UserModel, { name: 'actor' })
  async actor(@Parent() auditLog: AuditLogModel): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: auditLog.actorId } });
  }
}
