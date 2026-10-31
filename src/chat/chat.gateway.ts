import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ForbiddenException, Logger } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';
import { ChatRealtimeService } from './chat-realtime.service';

type ChatSocket = Omit<Socket, 'data'> & { data: { userId?: string } };

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly events: ChatRealtimeService,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.events.attach(server);
  }

  async handleConnection(client: ChatSocket) {
    try {
      const token = readSocketToken(client);
      if (typeof token !== 'string' || token.length < 20)
        throw new Error('Missing token');
      const payload = await this.jwt.verifyAsync<{
        sub?: string;
        exp?: number;
      }>(token);
      if (!payload.sub) throw new Error('Invalid subject');
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, status: UserStatus.ACTIVE, isDeleted: false },
        select: { id: true },
      });
      if (!user) throw new Error('Inactive account');
      const origin = client.handshake.headers.origin;
      const allowed = this.allowedOrigins();
      if (origin && allowed.length && !allowed.includes(origin))
        throw new Error('Origin rejected');
      client.data.userId = user.id;
      await client.join(`user:${user.id}`);
      if (payload.exp)
        setTimeout(
          () => client.disconnect(true),
          Math.max(0, payload.exp * 1000 - Date.now()),
        ).unref();
    } catch {
      this.logger.warn('Rejected unauthenticated chat socket connection');
      client.disconnect(true);
    }
  }

  handleDisconnect() {}

  @SubscribeMessage('chat:join')
  async joinConversation(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const userId = client.data.userId;
    if (!userId || typeof body?.conversationId !== 'string')
      throw new ForbiddenException();
    await this.chat.assertParticipant(body.conversationId, userId);
    await client.join(`conversation:${body.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('chat:leave')
  async leaveConversation(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { conversationId?: string },
  ) {
    if (typeof body?.conversationId === 'string')
      await client.leave(`conversation:${body.conversationId}`);
    return { ok: true };
  }

  private allowedOrigins(): string[] {
    const values = [
      this.config.get<string>('APP_URL') ?? '',
      ...(this.config.get<string>('CORS_ORIGINS') ?? '').split(','),
    ];
    return values
      .map((value) => {
        try {
          return new URL(value.trim()).origin;
        } catch {
          return '';
        }
      })
      .filter(Boolean);
  }
}

function readSocketToken(client: {
  handshake: { auth: unknown };
}): string | undefined {
  const auth: unknown = client.handshake.auth;
  if (typeof auth !== 'object' || auth === null || !('token' in auth))
    return undefined;
  const token = auth.token;
  return typeof token === 'string' ? token : undefined;
}
