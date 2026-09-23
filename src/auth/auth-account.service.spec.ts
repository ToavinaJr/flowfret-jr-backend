import { HttpException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthAccountService } from './auth-account.service';
import { hashOpaqueToken } from './auth.utils';

function serviceWith(prisma: Record<string, unknown>) {
  return new AuthAccountService(prisma as unknown as PrismaService);
}

describe('AuthAccountService', () => {
  it('lists only active sessions and identifies the current cookie', async () => {
    const createdAt = new Date();
    const expiresAt = new Date(Date.now() + 60_000);
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'session-id',
        tokenHash: hashOpaqueToken('current-token'),
        createdAt,
        expiresAt,
      },
    ]);
    const service = serviceWith({ refreshToken: { findMany } });

    await expect(service.sessions('user-id', 'current-token')).resolves.toEqual(
      [{ id: 'session-id', createdAt, expiresAt, current: true }],
    );
    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        revokedAt: null,
        isDeleted: false,
        expiresAt: { gt: expect.any(Date) as Date },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tokenHash: true,
        createdAt: true,
        expiresAt: true,
      },
    });
  });

  it('cannot revoke a session belonging to another user', async () => {
    const service = serviceWith({
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    });

    await expect(
      service.revokeSession('session-id', 'actor-id'),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('changes a password and revokes every refresh session atomically', async () => {
    const passwordHash = await bcrypt.hash('old-password', 4);
    const tx = {
      user: { update: jest.fn().mockResolvedValue({}) },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = serviceWith({
      user: { findFirst: jest.fn().mockResolvedValue({ passwordHash }) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    });

    await expect(
      service.changePassword('user-id', 'old-password', 'new-password'),
    ).resolves.toBe(true);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', revokedAt: null, isDeleted: false },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it('requires explicit DELETE confirmation', async () => {
    const service = serviceWith({});
    await expect(
      service.deleteAccount('user-id', undefined, 'delete'),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
