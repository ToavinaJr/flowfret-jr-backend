import { PrismaService } from '../prisma/prisma.service';
import { AuthTokenCleanupService } from './auth-token-cleanup.service';

describe('AuthTokenCleanupService', () => {
  it('deletes only token records outside the seven-day retention window', async () => {
    const prisma = {
      refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      passwordResetToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      emailVerificationToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new AuthTokenCleanupService(
      prisma as unknown as PrismaService,
    );
    const now = new Date('2026-11-20T12:00:00.000Z');
    const cutoff = new Date('2026-11-13T12:00:00.000Z');

    await service.cleanupExpiredTokens(now);

    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: cutoff } },
    });
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }],
      },
    });
    expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }],
      },
    });
  });

  it('keeps cleanup errors from interrupting application startup', async () => {
    const prisma = {
      refreshToken: {
        deleteMany: jest.fn().mockRejectedValue(new Error('db')),
      },
      passwordResetToken: { deleteMany: jest.fn() },
      emailVerificationToken: { deleteMany: jest.fn() },
    };
    const service = new AuthTokenCleanupService(
      prisma as unknown as PrismaService,
    );

    await expect(service.cleanupExpiredTokens()).resolves.toBeUndefined();
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalledTimes(1);
  });
});
