import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const prisma = {
    profile: { findFirst: jest.fn() },
    friendship: { findMany: jest.fn() },
    postLike: { findMany: jest.fn() },
    comment: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    notificationPreference: { findMany: jest.fn() },
    notification: { createMany: jest.fn() },
  };
  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.profile.findFirst.mockResolvedValue({ avatarUrl: 'avatar.jpg' });
    prisma.friendship.findMany.mockResolvedValue([]);
    prisma.postLike.findMany.mockResolvedValue([]);
    prisma.comment.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({ username: 'owner' });
    prisma.notificationPreference.findMany.mockResolvedValue([]);
    prisma.notification.createMany.mockResolvedValue({ count: 1 });
    service = new NotificationsService(prisma as unknown as PrismaService);
  });

  it('notifies the recipient when a friend request is sent', async () => {
    await service.friendRequested('actor-id', 'alice', 'recipient-id');

    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'recipient-id',
          type: 'FRIEND_REQUEST',
          payload: {
            actorId: 'actor-id',
            actorUsername: 'alice',
            actorAvatarUrl: 'avatar.jpg',
            action: 'FRIEND_REQUESTED',
          },
        },
      ],
    });
  });

  it('does not create a friend request notification when it is disabled', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue([
      { userId: 'recipient-id' },
    ]);

    await service.friendRequested('actor-id', 'alice', 'recipient-id');

    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('notifies the post author when another user likes the post', async () => {
    await service.postLiked('actor-id', 'alice', 'post-id', 'author-id');

    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'author-id',
          type: 'POST_LIKE',
          payload: {
            actorId: 'actor-id',
            actorUsername: 'alice',
            actorAvatarUrl: 'avatar.jpg',
            postId: 'post-id',
            action: 'POST_LIKED',
          },
        },
      ],
    });
  });

  it('does not notify a user about their own like', async () => {
    await service.postLiked('author-id', 'alice', 'post-id', 'author-id');

    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
});
