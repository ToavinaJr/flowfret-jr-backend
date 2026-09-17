import {
  Field,
  GraphQLISODateTime,
  InputType,
  PartialType,
} from '@nestjs/graphql';
import { NotificationType, Prisma } from '@prisma/client';
import { GraphQLJSON } from 'graphql-type-json';
import './enums';

@InputType()
export class CreateNotificationInput {
  @Field() userId!: string;
  @Field(() => NotificationType) type!: NotificationType;
  @Field(() => GraphQLJSON) payload!: Prisma.InputJsonValue;
  @Field(() => GraphQLISODateTime, { nullable: true }) readAt?: Date | null;
}
@InputType()
export class UpdateNotificationInput extends PartialType(
  CreateNotificationInput,
) {}
@InputType()
export class CreateAuditLogInput {
  @Field() actorId!: string;
  @Field() action!: string;
  @Field() entityType!: string;
  @Field(() => String, { nullable: true }) entityId?: string | null;
  @Field(() => GraphQLJSON) metadata!: Prisma.InputJsonValue;
}
@InputType()
export class UpdateAuditLogInput extends PartialType(CreateAuditLogInput) {}
