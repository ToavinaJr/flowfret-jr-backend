import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PostStatus, PostVisibility, type Post } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireVisiblePost, visiblePostWhere } from './post-access';

describe('post access policy', () => {
  const viewerId = '11111111-1111-4111-8111-111111111111';
  const authorId = '22222222-2222-4222-8222-222222222222';

  const post: Post = {
    id: '33333333-3333-4333-8333-333333333333',
    authorId,
    content: 'contenu',
    coverImageUrl: null,
    audioUrl: null,
    visibility: PostVisibility.PRIVATE,
    status: PostStatus.ACTIVE,
    likeCount: 0,
    commentCount: 0,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const prisma = {
    friendship: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    post: {
      findFirst: jest.fn(),
    },
  } as unknown as PrismaService;

  beforeEach(() => jest.clearAllMocks());

  it('builds a feed filter containing public, owned and accepted-friend posts', async () => {
    (prisma.friendship.findMany as jest.Mock).mockResolvedValue([
      { requesterId: viewerId, receiverId: authorId },
    ]);

    const where = await visiblePostWhere(prisma, viewerId);

    expect(where.isDeleted).toBe(false);
    expect(where.status).toBe(PostStatus.ACTIVE);
    expect(where.OR).toContainEqual({ authorId: viewerId });
    expect(where.OR).toContainEqual({ visibility: PostVisibility.PUBLIC });
    expect(where.OR).toContainEqual({
      visibility: PostVisibility.FRIENDS,
      authorId: { in: [authorId] },
    });
  });

  it('rejects another user private post', async () => {
    (prisma.post.findFirst as jest.Mock).mockResolvedValue(post);

    await expect(
      requireVisiblePost(prisma, post.id, viewerId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a friends-only post when friendship is accepted', async () => {
    (prisma.post.findFirst as jest.Mock).mockResolvedValue({
      ...post,
      visibility: PostVisibility.FRIENDS,
    });
    (prisma.friendship.count as jest.Mock).mockResolvedValue(1);

    await expect(
      requireVisiblePost(prisma, post.id, viewerId),
    ).resolves.toEqual(expect.objectContaining({ id: post.id }));
  });

  it('does not reveal a missing or deleted post', async () => {
    (prisma.post.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      requireVisiblePost(prisma, post.id, viewerId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
