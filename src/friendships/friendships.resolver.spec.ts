import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FriendshipsResolver } from './friendships.resolver';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FriendshipsCommandService } from './friendships-command.service';
import { FriendshipsQueryService } from './friendships-query.service';
import { RATE_LIMIT_KEY } from '../auth/rate-limit.decorator';

function resolverWith(
  prisma: Record<string, unknown>,
  notifications: Record<string, unknown>,
) {
  const client = prisma as unknown as PrismaService;
  const notifier = notifications as unknown as NotificationsService;
  return new FriendshipsResolver(
    client,
    new FriendshipsQueryService(client),
    new FriendshipsCommandService(client, notifier),
  );
}

describe('FriendshipsResolver notifications', () => {
  it('rate-limits user discovery at the GraphQL boundary', () => {
    const method = Object.getOwnPropertyDescriptor(
      FriendshipsResolver.prototype,
      'searchUsers',
    )?.value as object;
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, method)).toEqual([
      { limit: 30, windowSeconds: 60, failClosed: true },
      { limit: 300, windowSeconds: 3600, failClosed: true },
    ]);
  });

  it('emits a notification after persisting a friend request', async () => {
    const friendship = {
      id: 'friendship-id',
      requesterId: 'actor-id',
      receiverId: 'recipient-id',
      status: 'PENDING',
    };
    const tx = {
      friendship: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(friendship),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'recipient-id' }) },
      friendship: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const notifications = {
      friendRequested: jest.fn().mockResolvedValue(undefined),
    };
    const resolver = resolverWith(prisma, notifications);

    await expect(
      resolver.sendFriendRequest('recipient-id', {
        req: { user: { sub: 'actor-id', username: 'alice' } },
      }),
    ).resolves.toEqual(friendship);
    expect(notifications.friendRequested).toHaveBeenCalledWith(
      'actor-id',
      'alice',
      'recipient-id',
    );
  });

  it('rejects self friendship requests before accessing persistence', async () => {
    const prisma = { user: { findFirst: jest.fn() } };
    const resolver = resolverWith(prisma, { friendRequested: jest.fn() });

    await expect(
      resolver.sendFriendRequest('actor-id', {
        req: { user: { sub: 'actor-id', username: 'alice' } },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('only lets a participant remove a friendship', async () => {
    const prisma = {
      friendship: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const resolver = resolverWith(prisma, {});

    await expect(
      resolver.removeFriend('friendship-id', {
        req: { user: { sub: 'actor-id' } },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('excludes existing relationships from user discovery', async () => {
    const prisma = {
      friendship: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { requesterId: 'actor-id', receiverId: 'friend-id' },
          ]),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const resolver = resolverWith(prisma, {});

    await resolver.searchUsers('bob', 20, {
      req: { user: { sub: 'actor-id' } },
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { notIn: ['actor-id', 'actor-id', 'friend-id'] },
        status: 'ACTIVE',
        isDeleted: false,
        OR: [
          { username: { contains: 'bob', mode: 'insensitive' } },
          {
            profile: {
              displayName: { contains: 'bob', mode: 'insensitive' },
              isDeleted: false,
              visibility: { not: 'PRIVATE' },
            },
          },
        ],
      },
      take: 20,
      orderBy: { username: 'asc' },
    });
  });
});
