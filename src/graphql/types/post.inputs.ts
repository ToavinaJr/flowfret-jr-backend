import {
  Field,
  GraphQLISODateTime,
  InputType,
  Int,
  PartialType,
} from '@nestjs/graphql';
import {
  AttachmentKind,
  CommentStatus,
  PostStatus,
  PostVisibility,
  ReportStatus,
} from '@prisma/client';
import {
  IsEnum,
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import './enums';

@InputType()
export class CreatePostInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  content?: string | null;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  coverImageUrl?: string | null;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  audioUrl?: string | null;
  @Field(() => PostVisibility, { nullable: true })
  @IsOptional()
  @IsEnum(PostVisibility)
  visibility?: PostVisibility;
  @Field(() => PostStatus, { nullable: true })
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;
  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsUUID('4', { each: true })
  imageUploadIds?: string[];
}
@InputType()
export class UpdatePostInput extends PartialType(CreatePostInput) {}
@InputType()
export class CreateCommentInput {
  @Field() @IsUUID() postId!: string;
  @Field() @IsString() @MinLength(1) @MaxLength(5000) content!: string;
  @Field(() => CommentStatus, { nullable: true })
  @IsOptional()
  @IsEnum(CommentStatus)
  status?: CommentStatus;
}
@InputType()
export class UpdateCommentInput extends PartialType(CreateCommentInput) {}
@InputType()
export class UpdatePostReportInput {
  @Field(() => ReportStatus, { nullable: true })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;
  @Field(() => GraphQLISODateTime, { nullable: true })
  @IsOptional()
  reviewedAt?: Date | null;
}
@InputType()
export class CreatePostAttachmentInput {
  @Field() postId!: string;
  @Field() uploadId!: string;
  @Field(() => AttachmentKind) kind!: AttachmentKind;
  @Field(() => Int, { nullable: true }) position?: number;
}
@InputType()
export class UpdatePostAttachmentInput extends PartialType(
  CreatePostAttachmentInput,
) {}
