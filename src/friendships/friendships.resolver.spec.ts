import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FriendshipsResolver } from './friendships.resolver';

describe('FriendshipsResolver notifications', () => {
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
    const resolver = new FriendshipsResolver(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );

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
});
