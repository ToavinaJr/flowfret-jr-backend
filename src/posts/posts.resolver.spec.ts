import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadCleanupService } from '../uploads/upload-cleanup.service';
import { PostsResolver } from './posts.resolver';
import { PostsCommandService } from './posts-command.service';
import { PostsQueryService } from './posts-query.service';
import { RATE_LIMIT_KEY } from '../auth/rate-limit.decorator';

const context = { req: { user: { sub: 'actor-id', username: 'alice' } } };

function resolverWith(prisma: Record<string, unknown>) {
  const notifications = {
    friendPosted: jest.fn().mockResolvedValue(undefined),
  };
  const cleanup = { processPending: jest.fn().mockResolvedValue(undefined) };
  return {
    resolver: new PostsResolver(
      prisma as unknown as PrismaService,
      new PostsQueryService(prisma as unknown as PrismaService),
      new PostsCommandService(
        prisma as unknown as PrismaService,
        notifications as unknown as NotificationsService,
        cleanup as unknown as UploadCleanupService,
      ),
    ),
    notifications,
    cleanup,
  };
}

describe('PostsResolver contracts', () => {
  it('rate-limits feed and post reads', () => {
    const posts = Object.getOwnPropertyDescriptor(
      PostsResolver.prototype,
      'posts',
    )?.value as object;
    const post = Object.getOwnPropertyDescriptor(
      PostsResolver.prototype,
      'post',
    )?.value as object;
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, posts)).toEqual([
      { limit: 120, windowSeconds: 60, failClosed: true },
      { limit: 1200, windowSeconds: 3600, failClosed: true },
    ]);
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, post)).toEqual([
      { limit: 240, windowSeconds: 60, failClosed: true },
    ]);
  });

  it('maps preloaded feed relations into the public post shape', async () => {
    const prisma = {
      friendship: { findMany: jest.fn().mockResolvedValue([]) },
      post: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'post-id',
            attachments: [
              {
                id: 'attachment-id',
                upload: { id: 'upload-id', fileSize: 42n },
              },
            ],
            likes: [{ id: 'like-id' }],
            mentions: [{ user: { id: 'mentioned-id' } }],
          },
        ]),
      },
    };
    const { resolver } = resolverWith(prisma);

    await expect(resolver.posts(context)).resolves.toEqual([
      expect.objectContaining({
        viewerHasLiked: true,
        viewerLikeId: 'like-id',
        mentionedUsers: [{ id: 'mentioned-id' }],
        attachments: [
          expect.objectContaining({
            upload: { id: 'upload-id', fileSize: '42' },
          }),
        ],
      }),
    ]);
  });

  it('persists audit data before notifying friends', async () => {
    const post = { id: 'post-id', visibility: 'PUBLIC' };
    const tx = {
      post: { create: jest.fn().mockResolvedValue(post) },
      postMention: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const { resolver, notifications } = resolverWith(prisma);

    await expect(
      resolver.createPost({ content: ' hello ' }, context),
    ).resolves.toEqual(post);
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(notifications.friendPosted).toHaveBeenCalledWith(
      'actor-id',
      'alice',
      'post-id',
    );
  });

  it('soft-deletes post relations and schedules orphan upload cleanup', async () => {
    const tx = {
      postAttachment: {
        findMany: jest.fn().mockResolvedValue([{ uploadId: 'upload-id' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      post: {
        update: jest
          .fn()
          .mockResolvedValue({ id: 'post-id', status: 'DELETED' }),
      },
      postMention: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      upload: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      post: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'post-id', authorId: 'actor-id' }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const { resolver, cleanup } = resolverWith(prisma);

    await resolver.deletePost('post-id', context);

    expect(tx.postMention.updateMany).toHaveBeenCalled();
    expect(tx.upload.updateMany).toHaveBeenCalled();
    expect(cleanup.processPending).toHaveBeenCalledWith(['upload-id']);
  });
});
