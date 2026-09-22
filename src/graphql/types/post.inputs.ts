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
  @Field() @IsUUID() authorId!: string;
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
  @Field() @IsUUID() authorId!: string;
  @Field() @IsString() @MinLength(1) @MaxLength(5000) content!: string;
  @Field(() => CommentStatus, { nullable: true })
  @IsOptional()
  @IsEnum(CommentStatus)
  status?: CommentStatus;
}
@InputType()
export class UpdateCommentInput extends PartialType(CreateCommentInput) {}
@InputType()
export class CreatePostLikeInput {
  @Field() @IsUUID() postId!: string;
  @Field() @IsUUID() userId!: string;
}
@InputType()
export class UpdatePostLikeInput extends PartialType(CreatePostLikeInput) {}
@InputType()
export class CreatePostReportInput {
  @Field() @IsUUID() postId!: string;
  @Field() @IsUUID() reporterId!: string;
  @Field() @IsString() @MinLength(5) @MaxLength(1000) reason!: string;
  @Field(() => ReportStatus, { nullable: true }) status?: ReportStatus;
  @Field(() => GraphQLISODateTime, { nullable: true }) reviewedAt?: Date | null;
}
@InputType()
export class UpdatePostReportInput extends PartialType(CreatePostReportInput) {}
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
@InputType()
export class CreatePostTagInput {
  @Field() postId!: string;
  @Field() tagId!: string;
}
@InputType()
export class UpdatePostTagInput extends PartialType(CreatePostTagInput) {}
