import { PrismaService } from '../prisma/prisma.service';
import { NotificationsResolver } from './notifications.resolver';
import { UsersService } from '../users/users.service';

describe('NotificationsResolver', () => {
  it('resolves the current notification actor from its payload', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'actor-id' });
    const resolver = new NotificationsResolver(
      { user: { findFirst } } as unknown as PrismaService,
      {} as UsersService,
    );

    await expect(
      resolver.actor({ payload: { actorId: 'actor-id' } } as never),
    ).resolves.toEqual({ id: 'actor-id' });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'actor-id', isDeleted: false, status: 'ACTIVE' },
    });
  });

  it('resolves the notification avatar using the viewer profile visibility rules', async () => {
    const socialAvatarUrl = jest.fn().mockResolvedValue('avatar.png');
    const resolver = new NotificationsResolver(
      {} as PrismaService,
      { socialAvatarUrl } as unknown as UsersService,
    );

    await expect(
      resolver.actorAvatarUrl({ payload: { senderId: 'actor-id' } } as never, {
        req: { user: { sub: 'viewer-id' } },
      }),
    ).resolves.toBe('avatar.png');
    expect(socialAvatarUrl).toHaveBeenCalledWith('actor-id', 'viewer-id');
  });

  it('counts only unread, active notifications for the authenticated user', async () => {
    const prisma = {
      notification: { count: jest.fn().mockResolvedValue(3) },
    };
    const resolver = new NotificationsResolver(
      prisma as unknown as PrismaService,
      {} as UsersService,
    );

    await expect(
      resolver.unreadNotificationCount({ req: { user: { sub: 'user-id' } } }),
    ).resolves.toBe(3);
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        isDeleted: false,
        readAt: null,
        type: { not: 'CHAT_MESSAGE' },
      },
    });
  });

  it('omits stored chat-message notifications from the global feed', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const resolver = new NotificationsResolver(
      { notification: { findMany } } as unknown as PrismaService,
      {} as UsersService,
    );

    await resolver.myNotifications({ req: { user: { sub: 'user-id' } } }, 25);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-id',
          isDeleted: false,
          type: { not: 'CHAT_MESSAGE' },
        },
      }),
    );
  });
});
