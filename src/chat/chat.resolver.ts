import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ChatConversationView, ChatMessageView } from './chat.types';
import { ConversationParticipantRole } from '@prisma/client';
import { ChatService } from './chat.service';
import { RateLimits } from '../auth/rate-limit.decorator';

type ChatContext = { req: { user: { sub: string } } };

@Resolver()
export class ChatResolver {
  constructor(private readonly chat: ChatService) {}

  @Query(() => [ChatConversationView])
  myConversations(@Context() context: ChatContext) {
    return this.chat.list(context.req.user.sub);
  }

  @Query(() => [ChatMessageView])
  conversationMessages(
    @Args('conversationId') conversationId: string,
    @Args('before', { type: () => String, nullable: true })
    before: string | undefined,
    @Args('take', { type: () => Int, defaultValue: 30 }) take: number,
    @Context() context: ChatContext,
  ) {
    return this.chat.messages(
      context.req.user.sub,
      conversationId,
      before,
      take,
    );
  }

  @Mutation(() => ChatConversationView)
  @RateLimits({ limit: 10, windowSeconds: 60, failClosed: true })
  createDirectConversation(
    @Args('friendId') friendId: string,
    @Context() context: ChatContext,
  ) {
    return this.chat.direct(context.req.user.sub, friendId);
  }

  @Mutation(() => ChatConversationView)
  @RateLimits({ limit: 5, windowSeconds: 60, failClosed: true })
  createGroupConversation(
    @Args('name') name: string,
    @Args('memberIds', { type: () => [String] }) memberIds: string[],
    @Context() context: ChatContext,
  ) {
    return this.chat.group(context.req.user.sub, name, memberIds);
  }

  @Mutation(() => ChatMessageView)
  @RateLimits({ limit: 30, windowSeconds: 60, failClosed: true })
  sendChatMessage(
    @Args('conversationId') conversationId: string,
    @Args('body', { type: () => String, nullable: true }) body: string | null,
    @Args('uploadIds', { type: () => [String], defaultValue: [] })
    uploadIds: string[],
    @Context() context: ChatContext,
  ) {
    return this.chat.send(
      context.req.user.sub,
      conversationId,
      body,
      uploadIds,
    );
  }

  @Mutation(() => Boolean)
  setChatNickname(
    @Args('conversationId') conversationId: string,
    @Args('nickname', { type: () => String, nullable: true })
    nickname: string | null,
    @Context() context: ChatContext,
  ) {
    return this.chat.setNickname(
      context.req.user.sub,
      conversationId,
      nickname,
    );
  }

  @Mutation(() => Boolean)
  markConversationRead(
    @Args('conversationId') conversationId: string,
    @Context() context: ChatContext,
  ) {
    return this.chat.markRead(context.req.user.sub, conversationId);
  }

  @Mutation(() => ChatConversationView)
  renameChatGroup(
    @Args('conversationId') conversationId: string,
    @Args('name') name: string,
    @Context() context: ChatContext,
  ) {
    return this.chat.renameGroup(context.req.user.sub, conversationId, name);
  }

  @Mutation(() => ChatConversationView)
  addChatGroupMembers(
    @Args('conversationId') conversationId: string,
    @Args('memberIds', { type: () => [String] }) memberIds: string[],
    @Context() context: ChatContext,
  ) {
    return this.chat.addGroupMembers(
      context.req.user.sub,
      conversationId,
      memberIds,
    );
  }

  @Mutation(() => Boolean)
  removeChatGroupMember(
    @Args('conversationId') conversationId: string,
    @Args('memberId') memberId: string,
    @Context() context: ChatContext,
  ) {
    return this.chat.removeGroupMember(
      context.req.user.sub,
      conversationId,
      memberId,
    );
  }

  @Mutation(() => Boolean)
  setChatGroupRole(
    @Args('conversationId') conversationId: string,
    @Args('memberId') memberId: string,
    @Args('role', { type: () => ConversationParticipantRole })
    role: ConversationParticipantRole,
    @Context() context: ChatContext,
  ) {
    return this.chat.setGroupRole(
      context.req.user.sub,
      conversationId,
      memberId,
      role,
    );
  }
}
