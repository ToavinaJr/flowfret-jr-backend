import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { ApplicationException } from '../common/application-exception';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUser, AdminUserSecurityResult } from './admin.types';

const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  username: true,
  status: true,
  role: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
  deletedAt: true,
  profile: { select: { displayName: true } },
} satisfies Prisma.UserSelect;

type AdminUserRow = Prisma.UserGetPayload<{
  select: typeof ADMIN_USER_SELECT;
}>;

type SecurityAction =
  | typeof AUDIT_ACTION.ADMIN_USER_ROLE_CHANGED
  | typeof AUDIT_ACTION.ADMIN_USER_STATUS_CHANGED
  | typeof AUDIT_ACTION.ADMIN_USER_DELETED
  | typeof AUDIT_ACTION.ADMIN_USER_SESSIONS_REVOKED;

@Injectable()
export class AdminSecurityService {
  constructor(private readonly prisma: PrismaService) {}

  setRole(
    actorId: string,
    userId: string,
    role: UserRole,
    reason: string,
  ): Promise<AdminUserSecurityResult> {
    return this.mutateUser(
      actorId,
      userId,
      reason,
      async (tx, target, normalizedReason) => {
        if (target.role === role) {
          throw this.conflict(
            'ADMIN_USER_ROLE_UNCHANGED',
            'User already has this role.',
          );
        }
        await this.protectLastAdmin(tx, target, {
          role,
          status: target.status,
          isDeleted: target.isDeleted,
        });
        const user = await tx.user.update({
          where: { id: userId },
          data: { role },
          select: ADMIN_USER_SELECT,
        });
        return {
          user,
          action: AUDIT_ACTION.ADMIN_USER_ROLE_CHANGED,
          metadata: {
            reason: normalizedReason,
            previousRole: target.role,
            nextRole: role,
          },
        };
      },
    );
  }

  setStatus(
    actorId: string,
    userId: string,
    status: UserStatus,
    reason: string,
  ): Promise<AdminUserSecurityResult> {
    if (status === UserStatus.DELETED) {
      throw new ApplicationException(
        'ADMIN_DELETE_REQUIRED',
        'Use the dedicated delete operation for deleted accounts.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.mutateUser(
      actorId,
      userId,
      reason,
      async (tx, target, normalizedReason) => {
        if (target.status === status) {
          throw this.conflict(
            'ADMIN_USER_STATUS_UNCHANGED',
            'User already has this status.',
          );
        }
        await this.protectLastAdmin(tx, target, {
          role: target.role,
          status,
          isDeleted: target.isDeleted,
        });
        const user = await tx.user.update({
          where: { id: userId },
          data: { status },
          select: ADMIN_USER_SELECT,
        });
        return {
          user,
          action: AUDIT_ACTION.ADMIN_USER_STATUS_CHANGED,
          metadata: {
            reason: normalizedReason,
            previousStatus: target.status,
            nextStatus: status,
          },
        };
      },
    );
  }

  deleteUser(
    actorId: string,
    userId: string,
    reason: string,
  ): Promise<AdminUserSecurityResult> {
    return this.mutateUser(
      actorId,
      userId,
      reason,
      async (tx, target, normalizedReason) => {
        await this.protectLastAdmin(tx, target, {
          role: target.role,
          status: UserStatus.DELETED,
          isDeleted: true,
        });
        const user = await tx.user.update({
          where: { id: userId },
          data: {
            status: UserStatus.DELETED,
            isDeleted: true,
            deletedAt: new Date(),
          },
          select: ADMIN_USER_SELECT,
        });
        return {
          user,
          action: AUDIT_ACTION.ADMIN_USER_DELETED,
          metadata: {
            reason: normalizedReason,
            previousRole: target.role,
            previousStatus: target.status,
          },
        };
      },
    );
  }

  revokeSessions(
    actorId: string,
    userId: string,
    reason: string,
  ): Promise<AdminUserSecurityResult> {
    return this.mutateUser(
      actorId,
      userId,
      reason,
      (_tx, target, normalizedReason) =>
        Promise.resolve({
          user: target,
          action: AUDIT_ACTION.ADMIN_USER_SESSIONS_REVOKED,
          metadata: { reason: normalizedReason },
        }),
    );
  }

  private async mutateUser(
    actorId: string,
    userId: string,
    rawReason: string,
    mutation: (
      tx: Prisma.TransactionClient,
      target: AdminUserRow,
      reason: string,
    ) => Promise<{
      user: AdminUserRow;
      action: SecurityAction;
      metadata: Prisma.InputJsonObject;
    }>,
  ): Promise<AdminUserSecurityResult> {
    const reason = rawReason.trim();
    if (reason.length < 3) {
      throw new ApplicationException(
        'ADMIN_REASON_REQUIRED',
        'A reason of at least 3 characters is required.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: userId },
          select: ADMIN_USER_SELECT,
        });
        if (!target || target.isDeleted) {
          throw new ApplicationException(
            'ADMIN_USER_NOT_FOUND',
            'User not found.',
            HttpStatus.NOT_FOUND,
          );
        }

        const change = await mutation(tx, target, reason);
        const revoked = await tx.refreshToken.updateMany({
          where: {
            userId,
            revokedAt: null,
            isDeleted: false,
          },
          data: { revokedAt: new Date() },
        });
        const audit = await tx.auditLog.create({
          data: {
            actorId,
            action: change.action,
            entityType: AUDIT_ENTITY.USER,
            entityId: userId,
            metadata: change.metadata,
          },
          select: { id: true },
        });

        return {
          user: this.toAdminUser(change.user),
          revokedSessionCount: revoked.count,
          auditLogId: audit.id,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async protectLastAdmin(
    tx: Prisma.TransactionClient,
    current: AdminUserRow,
    next: Pick<AdminUserRow, 'role' | 'status' | 'isDeleted'>,
  ): Promise<void> {
    const currentlyActiveAdmin =
      current.role === UserRole.ADMIN &&
      current.status === UserStatus.ACTIVE &&
      !current.isDeleted;
    const remainsActiveAdmin =
      next.role === UserRole.ADMIN &&
      next.status === UserStatus.ACTIVE &&
      !next.isDeleted;
    if (!currentlyActiveAdmin || remainsActiveAdmin) return;

    const otherActiveAdmins = await tx.user.count({
      where: {
        id: { not: current.id },
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        isDeleted: false,
      },
    });
    if (otherActiveAdmins === 0) {
      throw this.conflict(
        'ADMIN_LAST_ACTIVE_ADMIN',
        'The last active administrator cannot be demoted, suspended, or deleted.',
      );
    }
  }

  private toAdminUser(row: AdminUserRow): AdminUser {
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      status: row.status,
      role: row.role,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isDeleted: row.isDeleted,
      deletedAt: row.deletedAt,
      displayName: row.profile?.displayName ?? null,
    };
  }

  private conflict(code: string, message: string): ApplicationException {
    return new ApplicationException(code, message, HttpStatus.CONFLICT);
  }
}
