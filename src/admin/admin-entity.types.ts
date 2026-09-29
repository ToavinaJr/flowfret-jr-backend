import {
  Field,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

export enum AdminManagedEntity {
  USER = 'USER',
  PROFILE = 'PROFILE',
  POST = 'POST',
  COMMENT = 'COMMENT',
  FRIENDSHIP = 'FRIENDSHIP',
  UPLOAD = 'UPLOAD',
  NOTIFICATION = 'NOTIFICATION',
  NOTIFICATION_PREFERENCE = 'NOTIFICATION_PREFERENCE',
  POST_LIKE = 'POST_LIKE',
  POST_REPORT = 'POST_REPORT',
  POST_MENTION = 'POST_MENTION',
  COMMENT_MENTION = 'COMMENT_MENTION',
  POST_ATTACHMENT = 'POST_ATTACHMENT',
  TRANSCRIPTION = 'TRANSCRIPTION',
  CHORD_TRANSCRIPTION = 'CHORD_TRANSCRIPTION',
  LISTENING_HISTORY = 'LISTENING_HISTORY',
  CATALOG_TRACK = 'CATALOG_TRACK',
  PLAYLIST = 'PLAYLIST',
  PLAYLIST_ITEM = 'PLAYLIST_ITEM',
  TRANSCRIPTION_ACCESS = 'TRANSCRIPTION_ACCESS',
}

registerEnumType(AdminManagedEntity, { name: 'AdminManagedEntity' });

@InputType()
export class AdminManagedEntityListInput {
  @Field(() => AdminManagedEntity)
  @IsEnum(AdminManagedEntity)
  entity!: AdminManagedEntity;

  @Field(() => Int, { defaultValue: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  first = 50;

  @Field(() => Int, { defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  skip = 0;

  @Field(() => Boolean, { defaultValue: false })
  @IsOptional()
  @IsBoolean()
  includeDeleted = false;
}

@InputType()
export class AdminManagedEntityMutationInput {
  @Field(() => AdminManagedEntity)
  @IsEnum(AdminManagedEntity)
  entity!: AdminManagedEntity;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  recordId?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  data?: unknown;

  @Field(() => String)
  @IsString()
  @MaxLength(500)
  reason!: string;
}

@ObjectType()
export class AdminManagedEntityConnection {
  @Field(() => [GraphQLJSON])
  nodes!: unknown[];

  @Field(() => Int)
  totalCount!: number;
}
