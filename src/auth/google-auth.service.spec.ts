import { ConflictException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleAuthService } from './google-auth.service';
import { GoogleProfileService } from './google-profile.service';

const googleProfile = {
  sub: 'google-id',
  email: 'Alice@Example.com',
  email_verified: true,
  name: 'Alice Doe',
  picture: 'https://images.example.com/alice.jpg',
};

function setup(prisma: Record<string, unknown>) {
  const profiles = { fetch: jest.fn().mockResolvedValue(googleProfile) };
  return {
    service: new GoogleAuthService(
      prisma as unknown as PrismaService,
      profiles as unknown as GoogleProfileService,
    ),
    profiles,
  };
}

describe('GoogleAuthService', () => {
  it('activates a completed Google account during login', async () => {
    const user = {
      id: 'user-id',
      googleId: 'google-id',
      status: UserStatus.ACTIVE,
    };
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue(user),
      },
    };
    const { service } = setup(prisma);

    await expect(service.login('access-token')).resolves.toEqual(user);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { googleId: 'google-id', googleSignupCompleted: true },
    });
  });

  it('rejects registration when the email already belongs to an account', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'existing-id',
          email: 'alice@example.com',
          googleId: null,
        }),
      },
    };
    const { service } = setup(prisma);

    await expect(service.register('access-token')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('normalizes email and allocates a username for a new Google account', async () => {
    const created = { id: 'user-id', email: 'alice@example.com' };
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const { service } = setup(prisma);

    await expect(service.register('access-token')).resolves.toEqual(created);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'alice@example.com',
        username: 'alice_doe',
        googleId: 'google-id',
        googleSignupCompleted: true,
      }),
    });
  });
});
