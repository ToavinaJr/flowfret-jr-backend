import { ForbiddenException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommentsResolver } from './comments.resolver';
import { CommentsCommandService } from './comments-command.service';
import { CommentsQueryService } from './comments-query.service';

const context = { req: { user: { sub: 'actor-id', username: 'alice' } } };

function setup(prisma: Record<string, unknown>) {
  const notifications = {
    postCommented: jest.fn().mockResolvedValue(undefined),
  };
  return {
    resolver: new CommentsResolver(
      prisma as unknown as PrismaService,
      new CommentsQueryService(prisma as unknown as PrismaService),
      new CommentsCommandService(
        prisma as unknown as PrismaService,
        notifications as unknown as NotificationsService,
      ),
    ),
    notifications,
  };
}

describe('CommentsResolver contracts', () => {
  it('rejects commenting on behalf of another user', async () => {
    const { resolver } = setup({});
    await expect(
      resolver.createComment(
        { postId: 'post-id', authorId: 'other-id', content: 'hello' },
        context,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a comment, increments the counter and notifies the author', async () => {
    const comment = {
      id: 'comment-id',
      postId: 'post-id',
      authorId: 'actor-id',
      content: 'hello',
    };
    const tx = {
      comment: { create: jest.fn().mockResolvedValue(comment) },
      commentMention: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      post: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      post: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'post-id',
          authorId: 'author-id',
          visibility: 'PUBLIC',
          status: 'ACTIVE',
        }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const { resolver, notifications } = setup(prisma);

    await expect(
      resolver.createComment(
        { postId: 'post-id', authorId: 'actor-id', content: ' hello ' },
        context,
      ),
    ).resolves.toEqual(comment);
    expect(tx.post.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { commentCount: { increment: 1 } } }),
    );
    expect(notifications.postCommented).toHaveBeenCalledWith(
      'actor-id',
      'alice',
      'post-id',
      'comment-id',
      'author-id',
    );
  });

  it('rejects updating another user comment', async () => {
    const prisma = {
      comment: {
        findFirst: jest.fn().mockResolvedValue({ authorId: 'other-id' }),
      },
    };
    const { resolver } = setup(prisma);
    await expect(
      resolver.updateComment('comment-id', { content: 'edited' }, context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('soft-deletes mentions and decrements the post counter', async () => {
    const tx = {
      comment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'comment-id',
          postId: 'post-id',
          authorId: 'actor-id',
        }),
        update: jest.fn().mockResolvedValue({
          id: 'comment-id',
          postId: 'post-id',
        }),
      },
      commentMention: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      post: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const { resolver } = setup(prisma);

    await resolver.deleteComment('comment-id', context);

    expect(tx.commentMention.updateMany).toHaveBeenCalled();
    expect(tx.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { commentCount: { decrement: 1 } } }),
    );
  });
});
