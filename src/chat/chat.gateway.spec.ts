import { ForbiddenException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { ChatGateway } from './chat.gateway';

describe('ChatGateway', () => {
  const jwt = { verifyAsync: jest.fn() };
  const prisma = { user: { findFirst: jest.fn() } };
  const chat = { assertParticipant: jest.fn() };
  const events = { attach: jest.fn() };
  const config = {
    get: jest.fn((key: string) =>
      key === 'APP_URL' ? 'https://app.example.test' : '',
    ),
  };
  const gateway = new ChatGateway(
    jwt as never,
    prisma as never,
    chat as never,
    events as never,
    config as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('authenticates a socket before joining its private user room', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 'active-user',
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    prisma.user.findFirst.mockResolvedValue({ id: 'active-user' });
    const socket = {
      handshake: {
        auth: { token: 'a-valid-long-access-token' },
        headers: { origin: 'https://app.example.test' },
      },
      data: {},
      join: jest.fn(),
      disconnect: jest.fn(),
    };

    await gateway.handleConnection(socket as never);

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'active-user',
          status: UserStatus.ACTIVE,
          isDeleted: false,
        },
      }),
    );
    expect(socket.join).toHaveBeenCalledWith('user:active-user');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('does not join a conversation room unless membership is verified', async () => {
    chat.assertParticipant.mockRejectedValue(new ForbiddenException());
    const socket = { data: { userId: 'user' }, join: jest.fn() };

    await expect(
      gateway.joinConversation(socket as never, {
        conversationId: 'conversation',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(socket.join).not.toHaveBeenCalled();
  });
});
