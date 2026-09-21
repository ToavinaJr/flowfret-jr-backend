import { PrismaService } from '../prisma/prisma.service';
import { NotificationsResolver } from './notifications.resolver';

describe('NotificationsResolver', () => {
  it('counts only unread, active notifications for the authenticated user', async () => {
    const prisma = {
      notification: { count: jest.fn().mockResolvedValue(3) },
    };
    const resolver = new NotificationsResolver(
      prisma as unknown as PrismaService,
    );

    await expect(
      resolver.unreadNotificationCount({ req: { user: { sub: 'user-id' } } }),
    ).resolves.toBe(3);
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 'user-id', isDeleted: false, readAt: null },
    });
  });
});
