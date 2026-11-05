import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { MailService } from '../mail/mail.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PasswordResetService } from './password-reset.service';
import { hashOpaqueToken } from './auth.utils';

describe('PasswordResetService', () => {
  const record = {
    id: 'reset-token-id',
    userId: 'user-id',
    tokenHash: hashOpaqueToken('reset-token'),
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  };

  function createService(consumedCount = 1) {
    const transaction = {
      passwordResetToken: {
        updateMany: jest.fn().mockResolvedValue({ count: consumedCount }),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      passwordResetToken: { findUnique: jest.fn().mockResolvedValue(record) },
      user: { findFirst: jest.fn() },
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new PasswordResetService(
      prisma as unknown as PrismaService,
      {} as MailService,
      {} as ConfigService,
    );
    return { service, prisma, transaction };
  }

  it('atomically consumes the exact unexpired token before changing password', async () => {
    const { service, transaction } = createService();

    await expect(
      service.reset('reset-token', 'new-password'),
    ).resolves.toBeUndefined();

    expect(transaction.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: record.id,
        usedAt: null,
        expiresAt: { gt: expect.any(Date) as Date },
      },
      data: { usedAt: expect.any(Date) as Date },
    });
    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: record.userId },
      data: { passwordHash: expect.any(String) as string },
    });
    expect(transaction.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it('rejects a token already consumed by a concurrent request', async () => {
    const { service, transaction } = createService(0);

    await expect(
      service.reset('reset-token', 'new-password'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.user.update).not.toHaveBeenCalled();
    expect(transaction.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('does not begin a transaction for an unknown token', async () => {
    const { service, prisma } = createService();
    jest
      .spyOn(prisma.passwordResetToken, 'findUnique')
      .mockResolvedValueOnce(null);

    await expect(
      service.reset('unknown-token', 'new-password'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('places new reset tokens in a URL fragment instead of the query string', async () => {
    const user = {
      id: 'user-id',
      email: 'person@example.com',
      username: 'person',
      passwordHash: 'hashed-password',
    };
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(user) },
      passwordResetToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const sendPasswordResetEmail = jest
      .fn<
        Promise<void>,
        [Parameters<MailService['sendPasswordResetEmail']>[0]]
      >()
      .mockResolvedValue(undefined);
    const mail = { sendPasswordResetEmail };
    const config = {
      get: jest.fn(() => 'https://flowfret.example'),
    };
    const service = new PasswordResetService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
      config as unknown as ConfigService,
    );

    await service.request(user.email);

    const resetLink = sendPasswordResetEmail.mock.calls[0][0].resetLink;
    expect(resetLink).toMatch(
      /^https:\/\/flowfret\.example\/reset-password#token=/,
    );
    expect(resetLink).not.toContain('?token=');
  });
});
