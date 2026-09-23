import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PostInteractionsResolver } from './post-interactions.resolver';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

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

  it('rejects a like created for another user', async () => {
    const resolver = new PostInteractionsResolver(
      {} as PrismaService,
      {} as NotificationsService,
    );

    await expect(
      resolver.createPostLike(
        { postId: 'post-id', userId: 'other-id' },
        { req: { user: { sub: 'actor-id', username: 'alice' } } },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
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
    const resolver = new PostInteractionsResolver(
      prisma as unknown as PrismaService,
      {} as NotificationsService,
    );

    await resolver.deletePostLike('like-id', {
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
    const resolver = new PostInteractionsResolver(
      prisma as unknown as PrismaService,
      {} as NotificationsService,
    );

    await expect(
      resolver.deletePostLike('missing', {
        req: { user: { sub: 'actor-id' } },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.post.updateMany).not.toHaveBeenCalled();
  });
});
