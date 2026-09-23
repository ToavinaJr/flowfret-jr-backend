import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesResolver } from './profiles.resolver';

describe('ProfilesResolver', () => {
  const profile = {
    id: 'profile-id',
    userId: 'user-id',
    displayName: 'Alice',
    isDeleted: false,
  };
  const context = { req: { user: { sub: 'user-id' } } };

  it('rejects an update containing a blank display name', async () => {
    const prisma = {
      profile: { findFirst: jest.fn().mockResolvedValue(profile) },
      $transaction: jest.fn(),
    };
    const resolver = new ProfilesResolver(prisma as unknown as PrismaService);

    await expect(
      resolver.updateProfile('profile-id', { displayName: '   ' }, context),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('normalizes the display name before persisting it', async () => {
    const tx = {
      profile: {
        update: jest.fn().mockResolvedValue({
          ...profile,
          displayName: 'Alice Cooper',
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      profile: { findFirst: jest.fn().mockResolvedValue(profile) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const resolver = new ProfilesResolver(prisma as unknown as PrismaService);

    await resolver.updateProfile(
      'profile-id',
      { displayName: '  Alice Cooper  ' },
      context,
    );

    expect(tx.profile.update).toHaveBeenCalledWith({
      where: { id: 'profile-id' },
      data: { displayName: 'Alice Cooper' },
    });
  });

  it('upserts concurrent profile creation attempts by user id', async () => {
    const tx = {
      profile: { upsert: jest.fn().mockResolvedValue(profile) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const resolver = new ProfilesResolver(prisma as unknown as PrismaService);

    await resolver.createProfile({ displayName: ' Alice ' }, context);

    expect(tx.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-id' },
      create: { userId: 'user-id', displayName: 'Alice' },
      update: {
        displayName: 'Alice',
        isDeleted: false,
        deletedAt: null,
      },
    });
  });
});
