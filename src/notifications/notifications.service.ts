import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async friendRequested(
    actorId: string,
    actorUsername: string,
    recipientId: string,
  ): Promise<void> {
    await this.createMany([recipientId], 'FRIEND_REQUEST', {
      ...(await this.actorPayload(actorId, actorUsername)),
      action: 'FRIEND_REQUESTED',
    });
  }

  async friendPosted(
    actorId: string,
    actorUsername: string,
    postId: string,
  ): Promise<void> {
    const friendIds = await this.friendIds(actorId);
    await this.createMany(friendIds, 'FRIEND_POST', {
      ...(await this.actorPayload(actorId, actorUsername)),
      postId,
      action: 'POST_CREATED',
    });
  }

  async postCommented(
    actorId: string,
    actorUsername: string,
    postId: string,
    commentId: string,
    postAuthorId: string,
  ): Promise<void> {
    if (postAuthorId !== actorId)
      await this.createMany([postAuthorId], 'POST_COMMENT', {
        ...(await this.actorPayload(actorId, actorUsername)),
        postId,
        commentId,
        action: 'COMMENT_CREATED',
      });
    await this.notifyEngagedFriends(
      actorId,
      actorUsername,
      postId,
      postAuthorId,
      'COMMENT_CREATED',
    );
  }

  async postLiked(
    actorId: string,
    actorUsername: string,
    postId: string,
    postAuthorId: string,
  ): Promise<void> {
    if (postAuthorId !== actorId)
      await this.createMany([postAuthorId], 'POST_LIKE', {
        ...(await this.actorPayload(actorId, actorUsername)),
        postId,
        action: 'POST_LIKED',
      });
    await this.notifyEngagedFriends(
      actorId,
      actorUsername,
      postId,
      postAuthorId,
      'POST_LIKED',
    );
  }

  async friendAccepted(
    actorId: string,
    actorUsername: string,
    recipientId: string,
  ): Promise<void> {
    await this.createMany([recipientId], 'FRIEND_ACCEPTED', {
      ...(await this.actorPayload(actorId, actorUsername)),
      action: 'FRIEND_ACCEPTED',
    });
  }

  private async notifyEngagedFriends(
    actorId: string,
    actorUsername: string,
    postId: string,
    postAuthorId: string,
    action: string,
  ) {
    const [friendIds, likes, comments, postAuthor] = await Promise.all([
      this.friendIds(actorId),
      this.prisma.postLike.findMany({
        where: { postId, isDeleted: false },
        select: { userId: true },
      }),
      this.prisma.comment.findMany({
        where: { postId, isDeleted: false },
        select: { authorId: true },
      }),
      this.prisma.user.findUnique({
        where: { id: postAuthorId },
        select: { username: true },
      }),
    ]);
    const engaged = new Set([
      ...likes.map((row) => row.userId),
      ...comments.map((row) => row.authorId),
    ]);
    const recipients = friendIds.filter(
      (id) => id !== actorId && id !== postAuthorId && engaged.has(id),
    );
    await this.createMany(recipients, 'FOLLOWED_POST_ACTIVITY', {
      ...(await this.actorPayload(actorId, actorUsername)),
      postId,
      postAuthorUsername: postAuthor?.username ?? null,
      action,
    });
  }

  private async actorPayload(actorId: string, actorUsername: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { userId: actorId, isDeleted: false },
      select: { avatarUrl: true },
    });
    return {
      actorId,
      actorUsername,
      actorAvatarUrl: profile?.avatarUrl ?? null,
    };
  }

  private async friendIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        isDeleted: false,
        OR: [{ requesterId: userId }, { receiverId: userId }],
      },
      select: { requesterId: true, receiverId: true },
    });
    return rows.map((row) =>
      row.requesterId === userId ? row.receiverId : row.requesterId,
    );
  }

  private async createMany(
    userIds: string[],
    type: NotificationType,
    payload: Prisma.InputJsonValue,
  ): Promise<void> {
    const uniqueIds = [...new Set(userIds)];
    if (!uniqueIds.length) return;
    const disabled = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: uniqueIds }, type, enabled: false },
      select: { userId: true },
    });
    const disabledIds = new Set(disabled.map((row) => row.userId));
    const recipients = uniqueIds.filter((id) => !disabledIds.has(id));
    if (recipients.length)
      await this.prisma.notification.createMany({
        data: recipients.map((userId) => ({ userId, type, payload })),
      });
  }
}
