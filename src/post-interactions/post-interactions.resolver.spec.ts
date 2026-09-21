import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PostInteractionsResolver } from './post-interactions.resolver';

describe('PostInteractionsResolver notifications', () => {
  it('does not notify twice when an active like already exists', async () => {
    const post = {
      id: 'post-id',
      authorId: 'author-id',
      status: 'ACTIVE',
      visibility: 'PUBLIC',
      isDeleted: false,
    };
    const like = {
      id: 'like-id',
      postId: 'post-id',
      userId: 'actor-id',
      isDeleted: false,
    };
    const tx = {
      post: { findFirst: jest.fn().mockResolvedValue(post) },
      postLike: { findUnique: jest.fn().mockResolvedValue(like) },
    };
    const prisma = {
      post: {
        findFirst: jest.fn().mockResolvedValue(post),
        findUnique: jest.fn().mockResolvedValue({ authorId: 'author-id' }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const notifications = { postLiked: jest.fn() };
    const resolver = new PostInteractionsResolver(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );

    await expect(
      resolver.createPostLike(
        { postId: 'post-id', userId: 'actor-id' },
        { req: { user: { sub: 'actor-id', username: 'alice' } } },
      ),
    ).resolves.toEqual(like);
    expect(notifications.postLiked).not.toHaveBeenCalled();
  });
});
