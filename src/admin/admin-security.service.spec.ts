import { HttpStatus } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { ApplicationException } from '../common/application-exception';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { PrismaService } from '../prisma/prisma.service';
import { AdminSecurityService } from './admin-security.service';

describe('AdminSecurityService', () => {
  const actorId = 'b2bd0044-47f4-4dd4-aa9b-dd9e5bc7f999';
  const userId = '58ff8d10-c354-4aa8-8cb8-c64065a8ff78';
  const baseUser = {
    id: userId,
    email: 'admin@example.com',
    username: 'admin',
    status: UserStatus.ACTIVE,
    role: UserRole.ADMIN,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    isDeleted: false,
    deletedAt: null,
    profile: { displayName: 'Admin' },
  };

  function setup(otherActiveAdmins = 1) {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue(baseUser),
        count: jest.fn().mockResolvedValue(otherActiveAdmins),
        update: jest.fn(),
      },
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-id' }),
      },
    };
    const transaction = jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    return { service: new AdminSecurityService(prisma), tx, transaction };
  }

  it('refuses to demote the last active administrator', async () => {
    const { service, tx } = setup(0);

    try {
      await service.setRole(
        actorId,
        userId,
        UserRole.USER,
        'Team reorganisation',
      );
      fail('Expected the last-admin protection to reject the operation.');
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationException);
      const exception = error as ApplicationException;
      expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(exception.getResponse()).toEqual(
        expect.objectContaining({ code: 'ADMIN_LAST_ACTIVE_ADMIN' }),
      );
    }
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('changes status, revokes sessions and writes the audit atomically', async () => {
    const { service, tx, transaction } = setup(1);
    tx.user.update.mockResolvedValue({
      ...baseUser,
      status: UserStatus.SUSPENDED,
    });

    const result = await service.setStatus(
      actorId,
      userId,
      UserStatus.SUSPENDED,
      '  Security review  ',
    );

    expect(result.revokedSessionCount).toBe(2);
    expect(result.auditLogId).toBe('audit-id');
    expect(result.user.status).toBe(UserStatus.SUSPENDED);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId,
        action: AUDIT_ACTION.ADMIN_USER_STATUS_CHANGED,
        entityType: AUDIT_ENTITY.USER,
        entityId: userId,
        metadata: {
          reason: 'Security review',
          previousStatus: UserStatus.ACTIVE,
          nextStatus: UserStatus.SUSPENDED,
        },
      },
      select: { id: true },
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('requires a meaningful reason before opening a transaction', async () => {
    const { service, transaction } = setup();

    await expect(
      service.revokeSessions(actorId, userId, '  '),
    ).rejects.toBeInstanceOf(ApplicationException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
