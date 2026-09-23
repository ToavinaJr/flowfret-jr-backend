import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PostInteractionsResolver } from './post-interactions.resolver';
import { NotFoundException } from '@nestjs/common';
import { PostInteractionsQueryService } from './post-interactions-query.service';
import { PostLikesService } from './post-likes.service';
import { PostModerationService } from './post-moderation.service';

function resolverWith(
  prisma: Record<string, unknown>,
  notifications: Record<string, unknown>,
) {
  const client = prisma as unknown as PrismaService;
  return new PostInteractionsResolver(
    new PostInteractionsQueryService(client),
    new PostLikesService(
      client,
      notifications as unknown as NotificationsService,
    ),
    new PostModerationService(client),
  );
}

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
    const resolver = resolverWith(prisma, notifications);

    await expect(
      resolver.likePost('post-id', {
        req: { user: { sub: 'actor-id', username: 'alice' } },
      }),
    ).resolves.toEqual(like);
    expect(notifications.postLiked).not.toHaveBeenCalled();
  });

  it('soft-deletes an owned like and decrements its post counter', async () => {
    const tx = {
      postLike: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'like-id',
          postId: 'post-id',
          userId: 'actor-id',
        }),
        update: jest.fn().mockResolvedValue({ id: 'like-id', isDeleted: true }),
      },
      post: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const resolver = resolverWith(prisma, {});

    await resolver.unlikePost('post-id', {
      req: { user: { sub: 'actor-id' } },
    });

    expect(tx.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { likeCount: { decrement: 1 } } }),
    );
  });

  it('does not mutate counters for an unknown like', async () => {
    const tx = {
      postLike: { findFirst: jest.fn().mockResolvedValue(null) },
      post: { updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const resolver = resolverWith(prisma, {});

    await expect(
      resolver.unlikePost('post-id', {
        req: { user: { sub: 'actor-id' } },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.post.updateMany).not.toHaveBeenCalled();
  });
});
