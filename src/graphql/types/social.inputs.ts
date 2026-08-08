import { Field, InputType, PartialType } from '@nestjs/graphql';
import {
  FriendshipStatus,
  UploadSourceType,
  UploadStatus,
} from '@prisma/client';
import './enums';

@InputType()
export class CreateTagInput {
  @Field() name!: string;
}
@InputType()
export class UpdateTagInput extends PartialType(CreateTagInput) {}
@InputType()
export class CreateFriendshipInput {
  @Field() requesterId!: string;
  @Field() receiverId!: string;
  @Field(() => FriendshipStatus, { nullable: true }) status?: FriendshipStatus;
}
@InputType()
export class UpdateFriendshipInput extends PartialType(CreateFriendshipInput) {}
@InputType()
export class CreateUploadInput {
  @Field() userId!: string;
  @Field() fileName!: string;
  @Field() fileType!: string;
  @Field() fileSize!: string;
  @Field() storagePath!: string;
  @Field(() => Number, { nullable: true }) duration?: number | null;
  @Field(() => UploadStatus, { nullable: true }) status?: UploadStatus;
  @Field(() => UploadSourceType, { nullable: true })
  sourceType?: UploadSourceType;
}
@InputType()
export class UpdateUploadInput extends PartialType(CreateUploadInput) {}
