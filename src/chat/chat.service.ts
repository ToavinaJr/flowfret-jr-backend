import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConversationParticipantRole,
  ConversationType,
  FriendshipStatus,
  NotificationType,
  Prisma,
  UploadAccessType,
  UploadResourceType,
  UploadSourceType,
  UploadStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { visibleAvatarUrl } from '../users/avatar-visibility';
import { ChatRealtimeService } from './chat-realtime.service';

const chatInclude = {
  participants: {
    where: { isDeleted: false },
    include: {
      user: {
        select: {
          id: true,
          username: true,
        },
      },
    },
    orderBy: { joinedAt: 'asc' as const },
  },
  messages: {
    where: { isDeleted: false },
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    include: {
      sender: { select: { id: true, username: true } },
      attachments: {
        orderBy: { position: 'asc' as const },
        include: { upload: { select: { id: true } } },
      },
    },
  },
} satisfies Prisma.ConversationInclude;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: ChatRealtimeService,
  ) {}

  async list(userId: string) {
    const memberships = await this.prisma.conversationParticipant.findMany({
      where: { userId, isDeleted: false, conversation: { isDeleted: false } },
      include: { conversation: { include: chatInclude } },
    });
    return Promise.all(
      memberships.map(async ({ conversation, ...membership }) => {
        const latest = conversation.messages[0];
        const unreadCount = await this.prisma.chatMessage.count({
          where: {
            conversationId: conversation.id,
            isDeleted: false,
            senderId: { not: userId },
            ...(membership.lastReadAt
              ? { createdAt: { gt: membership.lastReadAt } }
              : {}),
          },
        });
        return {
          id: conversation.id,
          type: conversation.type,
          name: conversation.name,
          updatedAt: latest?.createdAt ?? conversation.updatedAt,
          unreadCount,
          participants: await this.toParticipants(
            conversation.participants,
            userId,
          ),
          lastMessage: latest ? this.toMessage(latest) : null,
        };
      }),
    ).then((items) =>
      items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    );
  }

  async direct(userId: string, friendId: string) {
    if (!isUuid(friendId)) throw new BadRequestException('Invalid friend id.');
    if (friendId === userId)
      throw new BadRequestException('Cannot start a chat with yourself.');
    await this.assertFriend(userId, friendId);
    const directKey = [userId, friendId].sort().join(':');
    const existing = await this.prisma.conversation.findUnique({
      where: { directKey },
      include: chatInclude,
    });
    if (existing) return this.toConversation(existing, userId);
    try {
      const created = await this.prisma.conversation.create({
        data: {
          type: ConversationType.DIRECT,
          directKey,
          creatorId: userId,
          participants: {
            create: [
              { userId, role: ConversationParticipantRole.ADMIN },
              { userId: friendId, role: ConversationParticipantRole.MEMBER },
            ],
          },
        },
        include: chatInclude,
      });
      return this.toConversation(created, userId);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.conversation.findUnique({
          where: { directKey },
          include: chatInclude,
        });
        if (raced) return this.toConversation(raced, userId);
      }
      throw error;
    }
  }

  async group(userId: string, name: string, memberIds: string[]) {
    if (!Array.isArray(memberIds) || memberIds.some((id) => !isUuid(id)))
      throw new BadRequestException('Group member ids are invalid.');
    const normalizedName = name.trim();
    const uniqueIds = [...new Set(memberIds)].filter((id) => id !== userId);
    if (!normalizedName || normalizedName.length > 80)
      throw new BadRequestException(
        'Group name must be between 1 and 80 characters.',
      );
    if (
      uniqueIds.length < 2 ||
      uniqueIds.length > 49 ||
      uniqueIds.length !== memberIds.filter((id) => id !== userId).length
    )
      throw new BadRequestException(
        'A group must have 3 to 50 distinct members, including you.',
      );
    for (const memberId of uniqueIds) await this.assertFriend(userId, memberId);
    const conversation = await this.prisma.conversation.create({
      data: {
        type: ConversationType.GROUP,
        name: normalizedName,
        creatorId: userId,
        participants: {
          create: [
            { userId, role: ConversationParticipantRole.ADMIN },
            ...uniqueIds.map((id) => ({
              userId: id,
              role: ConversationParticipantRole.MEMBER,
            })),
          ],
        },
      },
      include: chatInclude,
    });
    return this.toConversation(conversation, userId);
  }

  async messages(
    userId: string,
    conversationId: string,
    before: string | undefined,
    take: number,
  ) {
    if (!isUuid(conversationId) || (before && !isUuid(before)))
      throw new BadRequestException('Invalid conversation or message id.');
    await this.assertParticipant(conversationId, userId);
    const limit = Math.max(1, Math.min(50, take));
    const cursor = before
      ? await this.prisma.chatMessage.findFirst({
          where: { id: before, conversationId, isDeleted: false },
          select: { createdAt: true, id: true },
        })
      : null;
    if (before && !cursor)
      throw new BadRequestException('Invalid message cursor.');
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        conversationId,
        isDeleted: false,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        sender: { select: { id: true, username: true } },
        attachments: {
          orderBy: { position: 'asc' },
          include: { upload: { select: { id: true } } },
        },
      },
    });
    return rows.reverse().map((row) => this.toMessage(row));
  }

  async send(
    userId: string,
    conversationId: string,
    body: string | null,
    uploadIds: string[],
  ) {
    if (
      !isUuid(conversationId) ||
      !Array.isArray(uploadIds) ||
      uploadIds.some((id) => !isUuid(id))
    )
      throw new BadRequestException('Invalid conversation or attachment id.');
    await this.assertParticipant(conversationId, userId);
    const text = body?.trim() ?? '';
    if (
      text.length > 5000 ||
      (!text && uploadIds.length === 0) ||
      uploadIds.length > 4 ||
      new Set(uploadIds).size !== uploadIds.length
    )
      throw new BadRequestException(
        'A message must contain text or up to 4 distinct images; text is limited to 5000 characters.',
      );
    if (uploadIds.length) {
      const uploads = await this.prisma.upload.findMany({
        where: {
          id: { in: uploadIds },
          userId,
          isDeleted: false,
          status: UploadStatus.AVAILABLE,
          sourceType: UploadSourceType.MESSAGE,
          accessType: UploadAccessType.AUTHENTICATED,
          resourceType: UploadResourceType.IMAGE,
        },
        select: { id: true },
      });
      if (uploads.length !== uploadIds.length)
        throw new ForbiddenException('One or more images are unavailable.');
    }
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          conversationId,
          senderId: userId,
          body: text || null,
          attachments: {
            create: uploadIds.map((uploadId, position) => ({
              uploadId,
              position,
            })),
          },
        },
        include: {
          sender: { select: { id: true, username: true } },
          attachments: {
            orderBy: { position: 'asc' },
            include: { upload: { select: { id: true } } },
          },
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: created.createdAt },
      });
      const recipients = await tx.conversationParticipant.findMany({
        where: { conversationId, isDeleted: false, userId: { not: userId } },
        select: { userId: true },
      });
      const preferences = await tx.notificationPreference.findMany({
        where: {
          userId: { in: recipients.map((r) => r.userId) },
          type: NotificationType.CHAT_MESSAGE,
          enabled: false,
        },
        select: { userId: true },
      });
      const muted = new Set(preferences.map((p) => p.userId));
      const recipientIds = recipients
        .map((r) => r.userId)
        .filter((id) => !muted.has(id));
      if (recipientIds.length)
        await tx.notification.createMany({
          data: recipientIds.map((id) => ({
            userId: id,
            type: NotificationType.CHAT_MESSAGE,
            payload: {
              conversationId,
              messageId: created.id,
              senderId: userId,
              actorUsername: created.sender.username,
            },
            dedupeKey: `chat:${created.id}:${id}`,
          })),
        });
      return created;
    });
    const result = this.toMessage(message);
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, isDeleted: false },
      select: { userId: true },
    });
    this.realtime.publish(
      conversationId,
      result,
      participants.map((participant) => participant.userId),
    );
    return result;
  }

  async setNickname(
    userId: string,
    conversationId: string,
    nickname: string | null,
  ) {
    if (!isUuid(conversationId))
      throw new BadRequestException('Invalid conversation id.');
    await this.assertParticipant(conversationId, userId);
    const normalized = nickname?.trim() || null;
    if (normalized && normalized.length > 50)
      throw new BadRequestException('Nickname is limited to 50 characters.');
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { nickname: normalized },
    });
    return true;
  }

  async markRead(userId: string, conversationId: string) {
    if (!isUuid(conversationId))
      throw new BadRequestException('Invalid conversation id.');
    await this.assertParticipant(conversationId, userId);
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });
    return true;
  }

  async renameGroup(userId: string, conversationId: string, name: string) {
    const normalizedName = name.trim();
    if (
      !isUuid(conversationId) ||
      !normalizedName ||
      normalizedName.length > 80
    )
      throw new BadRequestException(
        'Group name must be between 1 and 80 characters.',
      );
    await this.assertGroupAdmin(conversationId, userId);
    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { name: normalizedName },
      include: chatInclude,
    });
    return this.toConversation(updated, userId);
  }

  async addGroupMembers(
    userId: string,
    conversationId: string,
    memberIds: string[],
  ) {
    if (
      !isUuid(conversationId) ||
      !Array.isArray(memberIds) ||
      memberIds.some((id) => !isUuid(id)) ||
      !memberIds.length ||
      new Set(memberIds).size !== memberIds.length
    )
      throw new BadRequestException('Invalid group members.');
    await this.assertGroupAdmin(conversationId, userId);
    const activeCount = await this.prisma.conversationParticipant.count({
      where: { conversationId, isDeleted: false },
    });
    if (activeCount + memberIds.length > 50)
      throw new BadRequestException('A group is limited to 50 members.');
    for (const memberId of memberIds) await this.assertFriend(userId, memberId);
    const existing = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { in: memberIds } },
      select: { userId: true, isDeleted: true },
    });
    const existingById = new Map(existing.map((item) => [item.userId, item]));
    await this.prisma.$transaction(
      memberIds.map((memberId) => {
        const previous = existingById.get(memberId);
        return previous
          ? this.prisma.conversationParticipant.update({
              where: {
                conversationId_userId: { conversationId, userId: memberId },
              },
              data: {
                isDeleted: false,
                deletedAt: null,
                joinedAt: new Date(),
                role: ConversationParticipantRole.MEMBER,
              },
            })
          : this.prisma.conversationParticipant.create({
              data: {
                conversationId,
                userId: memberId,
                role: ConversationParticipantRole.MEMBER,
              },
            });
      }),
    );
    return this.prisma.conversation
      .findUniqueOrThrow({
        where: { id: conversationId },
        include: chatInclude,
      })
      .then((item) => this.toConversation(item, userId));
  }

  async removeGroupMember(
    userId: string,
    conversationId: string,
    memberId: string,
  ) {
    if (!isUuid(conversationId) || !isUuid(memberId))
      throw new BadRequestException('Invalid group or member id.');
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        type: ConversationType.GROUP,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Group not found.');
    if (memberId !== userId)
      await this.assertGroupAdmin(conversationId, userId);
    const target = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: memberId, isDeleted: false },
    });
    if (!target) throw new NotFoundException('Group member not found.');
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: memberId } },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    this.realtime.revokeParticipant(conversationId, memberId);
    if (target.role === ConversationParticipantRole.ADMIN) {
      const anotherAdmin = await this.prisma.conversationParticipant.findFirst({
        where: {
          conversationId,
          isDeleted: false,
          role: ConversationParticipantRole.ADMIN,
        },
      });
      if (!anotherAdmin) {
        const nextAdmin = await this.prisma.conversationParticipant.findFirst({
          where: { conversationId, isDeleted: false },
          orderBy: { joinedAt: 'asc' },
        });
        if (nextAdmin)
          await this.prisma.conversationParticipant.update({
            where: { id: nextAdmin.id },
            data: { role: ConversationParticipantRole.ADMIN },
          });
      }
    }
    return true;
  }

  async setGroupRole(
    userId: string,
    conversationId: string,
    memberId: string,
    role: ConversationParticipantRole,
  ) {
    if (!isUuid(conversationId) || !isUuid(memberId))
      throw new BadRequestException('Invalid group or member id.');
    await this.assertGroupAdmin(conversationId, userId);
    if (role === ConversationParticipantRole.MEMBER) {
      const adminCount = await this.prisma.conversationParticipant.count({
        where: {
          conversationId,
          isDeleted: false,
          role: ConversationParticipantRole.ADMIN,
        },
      });
      const target = await this.prisma.conversationParticipant.findFirst({
        where: {
          conversationId,
          userId: memberId,
          isDeleted: false,
          role: ConversationParticipantRole.ADMIN,
        },
        select: { id: true },
      });
      if (target && adminCount < 2)
        throw new BadRequestException(
          'A group must keep at least one administrator.',
        );
    }
    const updated = await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId: memberId, isDeleted: false },
      data: { role },
    });
    if (!updated.count) throw new NotFoundException('Group member not found.');
    return true;
  }

  async assertParticipant(conversationId: string, userId: string) {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId,
        isDeleted: false,
        conversation: { isDeleted: false },
      },
      select: { id: true },
    });
    if (!participant) throw new NotFoundException('Conversation not found.');
  }

  private async assertFriend(userId: string, friendId: string) {
    const [users, friendship] = await Promise.all([
      this.prisma.user.count({
        where: {
          id: { in: [userId, friendId] },
          status: UserStatus.ACTIVE,
          isDeleted: false,
        },
      }),
      this.prisma.friendship.findFirst({
        where: {
          status: FriendshipStatus.ACCEPTED,
          isDeleted: false,
          OR: [
            { requesterId: userId, receiverId: friendId },
            { requesterId: friendId, receiverId: userId },
          ],
        },
        select: { id: true },
      }),
    ]);
    if (users !== 2 || !friendship)
      throw new ForbiddenException(
        'Chat is available only between active friends.',
      );
  }

  private async assertGroupAdmin(conversationId: string, userId: string) {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId,
        isDeleted: false,
        role: ConversationParticipantRole.ADMIN,
        conversation: { type: ConversationType.GROUP, isDeleted: false },
      },
      select: { id: true },
    });
    if (!participant)
      throw new ForbiddenException(
        'Only group administrators can perform this action.',
      );
  }

  private toParticipants(
    participants: Prisma.ConversationGetPayload<{
      include: typeof chatInclude;
    }>['participants'],
    viewerId: string,
  ) {
    return Promise.all(
      participants.map(async (p) => ({
        id: p.id,
        userId: p.userId,
        username: p.user.username,
        avatarUrl: await visibleAvatarUrl(this.prisma, p.userId, viewerId),
        nickname: p.nickname,
        role: p.role,
        lastReadAt: p.lastReadAt,
      })),
    );
  }

  private async toConversation(
    conversation: Prisma.ConversationGetPayload<{
      include: typeof chatInclude;
    }>,
    viewerId: string,
  ) {
    return {
      id: conversation.id,
      type: conversation.type,
      name: conversation.name,
      updatedAt: conversation.messages[0]?.createdAt ?? conversation.updatedAt,
      unreadCount: 0,
      participants: await this.toParticipants(
        conversation.participants,
        viewerId,
      ),
      lastMessage: conversation.messages[0]
        ? this.toMessage(conversation.messages[0])
        : null,
    };
  }

  private toMessage(message: {
    id: string;
    conversationId: string;
    senderId: string;
    body: string | null;
    createdAt: Date;
    sender: { username: string };
    attachments: { id: string; uploadId: string; position: number }[];
  }) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderUsername: message.sender.username,
      body: message.body,
      createdAt: message.createdAt,
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        uploadId: attachment.uploadId,
        position: attachment.position,
        contentUrl: `/uploads/message-images/${attachment.uploadId}`,
      })),
    };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
