import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, Post } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function visiblePostWhere(
  prisma: PrismaService,
  viewerId: string,
): Promise<Prisma.PostWhereInput> {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'ACCEPTED',
      isDeleted: false,
      OR: [{ requesterId: viewerId }, { receiverId: viewerId }],
    },
    select: { requesterId: true, receiverId: true },
  });
  const friendIds = friendships.map((friendship) =>
    friendship.requesterId === viewerId
      ? friendship.receiverId
      : friendship.requesterId,
  );

  return {
    isDeleted: false,
    status: 'ACTIVE',
    OR: [
      { authorId: viewerId },
      { visibility: 'PUBLIC' },
      ...(friendIds.length
        ? [{ visibility: 'FRIENDS' as const, authorId: { in: friendIds } }]
        : []),
    ],
  };
}

export async function requireVisiblePost(
  prisma: PrismaService,
  postId: string,
  viewerId: string,
): Promise<Post> {
  const post = await prisma.post.findFirst({
    where: { id: postId, isDeleted: false },
  });
  if (!post) throw new NotFoundException('Publication introuvable.');
  if (post.authorId === viewerId) return post;
  if (post.status !== 'ACTIVE')
    throw new ForbiddenException('Publication inaccessible.');
  if (post.visibility === 'PUBLIC') return post;
  if (post.visibility === 'PRIVATE')
    throw new ForbiddenException('Publication inaccessible.');

  const friendship = await prisma.friendship.count({
    where: {
      status: 'ACCEPTED',
      isDeleted: false,
      OR: [
        { requesterId: viewerId, receiverId: post.authorId },
        { requesterId: post.authorId, receiverId: viewerId },
      ],
    },
  });
  if (!friendship) throw new ForbiddenException('Publication inaccessible.');
  return post;
}
