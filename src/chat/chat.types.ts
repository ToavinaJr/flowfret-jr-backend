import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ConversationParticipantRole, ConversationType } from '@prisma/client';

registerEnumType(ConversationType, { name: 'ConversationType' });
registerEnumType(ConversationParticipantRole, {
  name: 'ConversationParticipantRole',
});

@ObjectType()
export class ChatParticipant {
  @Field(() => ID) id!: string;
  @Field(() => ID) userId!: string;
  @Field() username!: string;
  @Field(() => String, { nullable: true }) avatarUrl!: string | null;
  @Field(() => String, { nullable: true }) nickname!: string | null;
  @Field(() => ConversationParticipantRole) role!: ConversationParticipantRole;
  @Field(() => Date, { nullable: true }) lastReadAt!: Date | null;
}

@ObjectType()
export class ChatAttachment {
  @Field(() => ID) id!: string;
  @Field(() => ID) uploadId!: string;
  @Field(() => Int) position!: number;
  @Field() contentUrl!: string;
}

@ObjectType()
export class ChatMessageView {
  @Field(() => ID) id!: string;
  @Field(() => ID) conversationId!: string;
  @Field(() => ID) senderId!: string;
  @Field() senderUsername!: string;
  @Field(() => String, { nullable: true }) body!: string | null;
  @Field() createdAt!: Date;
  @Field(() => [ChatAttachment]) attachments!: ChatAttachment[];
}

@ObjectType()
export class ChatConversationView {
  @Field(() => ID) id!: string;
  @Field(() => ConversationType) type!: ConversationType;
  @Field(() => String, { nullable: true }) name!: string | null;
  @Field(() => [ChatParticipant]) participants!: ChatParticipant[];
  @Field(() => ChatMessageView, { nullable: true })
  lastMessage!: ChatMessageView | null;
  @Field(() => Int) unreadCount!: number;
  @Field() updatedAt!: Date;
}
