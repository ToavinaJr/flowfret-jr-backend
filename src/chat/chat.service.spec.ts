import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  ConversationParticipantRole,
  ConversationType,
  FriendshipStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatRealtimeService } from './chat-realtime.service';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  const userA = '00000000-0000-4000-8000-000000000001';
  const userB = '00000000-0000-4000-8000-000000000002';
  const prisma = {
    user: { count: jest.fn() },
    friendship: { findFirst: jest.fn() },
    conversation: { findUnique: jest.fn(), create: jest.fn() },
    conversationParticipant: {
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const realtime = { publish: jest.fn() };
  const service = new ChatService(
    prisma as unknown as PrismaService,
    realtime as unknown as ChatRealtimeService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('creates one direct conversation keyed independently of participant order', async () => {
    prisma.user.count.mockResolvedValue(2);
    prisma.friendship.findFirst.mockResolvedValue({
      id: 'friendship',
      status: FriendshipStatus.ACCEPTED,
    });
    prisma.conversation.findUnique.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({
      id: 'conversation',
      type: ConversationType.DIRECT,
      name: null,
      updatedAt: new Date(),
      participants: [],
      messages: [],
    });

    await service.direct(userB, userA);

    expect(prisma.conversation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { directKey: `${userA}:${userB}` },
      }),
    );
    expect(prisma.conversation.create).toHaveBeenCalled();
  });

  it('rejects direct messages when friendship is not accepted', async () => {
    prisma.user.count.mockResolvedValue(2);
    prisma.friendship.findFirst.mockResolvedValue(null);

    await expect(service.direct(userA, userB)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('rejects groups with duplicate members before persisting', async () => {
    await expect(service.group(userA, 'Jam', [userB, userB])).rejects.toThrow();
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('does not reveal a conversation to a non-participant', async () => {
    prisma.conversationParticipant.findFirst.mockResolvedValue(null);
    await expect(
      service.assertParticipant('known-id', 'outsider'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('trims a conversation nickname before saving it', async () => {
    prisma.conversationParticipant.findFirst.mockResolvedValue({
      id: 'membership',
    });
    prisma.conversationParticipant.update.mockResolvedValue({});

    await service.setNickname(
      userA,
      '00000000-0000-4000-8000-000000000003',
      '  Stage name  ',
    );

    expect(prisma.conversationParticipant.update).toHaveBeenCalledWith({
      where: {
        conversationId_userId: {
          conversationId: '00000000-0000-4000-8000-000000000003',
          userId: userA,
        },
      },
      data: { nickname: 'Stage name' },
    });
  });

  it('rejects conversation nicknames longer than 50 characters', async () => {
    prisma.conversationParticipant.findFirst.mockResolvedValue({
      id: 'membership',
    });

    await expect(
      service.setNickname(
        userA,
        '00000000-0000-4000-8000-000000000003',
        'x'.repeat(51),
      ),
    ).rejects.toThrow('Nickname is limited to 50 characters.');
    expect(prisma.conversationParticipant.update).not.toHaveBeenCalled();
  });

  it('prevents the only group administrator from demoting themselves', async () => {
    prisma.conversationParticipant.findFirst
      .mockResolvedValueOnce({ id: 'admin-membership' })
      .mockResolvedValueOnce({ id: 'admin-membership' });
    prisma.conversationParticipant.count.mockResolvedValue(1);

    await expect(
      service.setGroupRole(
        userA,
        '00000000-0000-4000-8000-000000000003',
        userA,
        ConversationParticipantRole.MEMBER,
      ),
    ).rejects.toThrow('A group must keep at least one administrator.');
    expect(prisma.conversationParticipant.updateMany).not.toHaveBeenCalled();
  });
});
