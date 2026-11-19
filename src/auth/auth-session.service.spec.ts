import { Logger, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthSessionService } from './auth-session.service';

const user = {
  id: 'user-id',
  email: 'player@example.test',
  username: 'player',
  status: 'ACTIVE',
};

function setup(existing: Record<string, unknown> | null = null) {
  const transaction = {
    refreshToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    refreshToken: {
      findUnique: jest.fn().mockResolvedValue(existing),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
      callback(transaction),
    ),
  };
  const jwt = { sign: jest.fn().mockReturnValue('access-token') };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const service = new AuthSessionService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
  );

  return { service, prisma, transaction };
}

function refreshRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'refresh-id',
    userId: user.id,
    familyId: 'family-id',
    revokedAt: null,
    rotatedAt: null,
    isDeleted: false,
    expiresAt: new Date(Date.now() + 60_000),
    user,
    ...overrides,
  };
}

describe('AuthSessionService refresh token families', () => {
  it('carries the family ID forward when rotating a refresh token', async () => {
    const { service, transaction } = setup(refreshRecord());

    await service.refresh('refresh-token');

    expect(transaction.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rotatedAt: expect.any(Date) }),
      }),
    );
    expect(transaction.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ familyId: 'family-id' }),
      }),
    );
  });

  it('revokes the active token family and logs reuse of a rotated token', async () => {
    const { service, prisma } = setup(
      refreshRecord({
        revokedAt: new Date(),
        rotatedAt: new Date(),
      }),
    );
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await expect(
      service.refresh('replayed-secret-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        familyId: 'family-id',
        revokedAt: null,
        isDeleted: false,
      },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('auth.refresh_token_reuse_detected'),
    );
    expect(warn.mock.calls[0]?.[0]).not.toContain('replayed-secret-token');
    warn.mockRestore();
  });

  it('revokes the family when another request wins the rotation race', async () => {
    const { service, prisma, transaction } = setup(refreshRecord());
    transaction.refreshToken.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await expect(service.refresh('raced-refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(transaction.refreshToken.updateMany).toHaveBeenCalledTimes(2);
    expect(transaction.refreshToken.updateMany).toHaveBeenLastCalledWith({
      where: {
        familyId: 'family-id',
        revokedAt: null,
        isDeleted: false,
      },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('auth.refresh_token_reuse_detected'),
    );
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
