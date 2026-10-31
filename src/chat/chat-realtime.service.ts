import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class ChatRealtimeService {
  private server: Server | null = null;

  attach(server: Server) {
    this.server = server;
  }

  publish(conversationId: string, message: unknown, participantIds: string[]) {
    this.server
      ?.to(`conversation:${conversationId}`)
      .emit('chat:message', message);
    for (const userId of participantIds)
      this.server
        ?.to(`user:${userId}`)
        .emit('chat:inbox-updated', { conversationId });
  }

  revokeParticipant(conversationId: string, userId: string) {
    void this.server
      ?.in(`user:${userId}`)
      .socketsLeave(`conversation:${conversationId}`);
  }
}
