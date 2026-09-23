import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  FriendshipStatus,
  Post,
  PostStatus,
  PostVisibility,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function visiblePostWhere(
  prisma: PrismaService,
  viewerId: string,
): Promise<Prisma.PostWhereInput> {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: FriendshipStatus.ACCEPTED,
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
    status: PostStatus.ACTIVE,
    OR: [
      { authorId: viewerId },
      { visibility: PostVisibility.PUBLIC },
      ...(friendIds.length
        ? [{ visibility: PostVisibility.FRIENDS, authorId: { in: friendIds } }]
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
  if (post.status !== PostStatus.ACTIVE)
    throw new ForbiddenException('Publication inaccessible.');
  if (post.visibility === PostVisibility.PUBLIC) return post;
  if (post.visibility === PostVisibility.PRIVATE)
    throw new ForbiddenException('Publication inaccessible.');

  const friendship = await prisma.friendship.count({
    where: {
      status: FriendshipStatus.ACCEPTED,
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
