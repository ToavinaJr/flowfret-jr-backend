import {
  Field,
  GraphQLISODateTime,
  InputType,
  Int,
  ObjectType,
  PartialType,
  registerEnumType,
} from '@nestjs/graphql';
import {
  CommentStatus,
  AttachmentKind,
  FriendshipStatus,
  NotificationType,
  ReportStatus,
  UploadSourceType,
  UploadStatus,
  PostStatus,
  PostVisibility,
  ProfileVisibility,
  Prisma,
  PostTag,
  UserStatus,
} from '@prisma/client';
import { GraphQLJSON } from 'graphql-type-json';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

registerEnumType(UserStatus, { name: 'UserStatus' });
registerEnumType(ProfileVisibility, { name: 'ProfileVisibility' });
registerEnumType(PostVisibility, { name: 'PostVisibility' });
registerEnumType(PostStatus, { name: 'PostStatus' });
registerEnumType(CommentStatus, { name: 'CommentStatus' });
registerEnumType(FriendshipStatus, { name: 'FriendshipStatus' });
registerEnumType(UploadStatus, { name: 'UploadStatus' });
registerEnumType(UploadSourceType, { name: 'UploadSourceType' });
registerEnumType(NotificationType, { name: 'NotificationType' });
registerEnumType(ReportStatus, { name: 'ReportStatus' });
registerEnumType(AttachmentKind, { name: 'AttachmentKind' });

@ObjectType()
export class UserModel {
  @Field()
  id!: string;

  @Field()
  email!: string;

  @Field()
  username!: string;

  @Field(() => String, { nullable: true })
  googleId?: string | null;

  @Field(() => UserStatus)
  status!: UserStatus;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastLoginAt!: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;

  @Field(() => ProfileModel, { nullable: true })
  profile?: ProfileModel | null;

  @Field(() => [PostModel])
  authoredPosts?: PostModel[];

  @Field(() => [CommentModel])
  comments?: CommentModel[];

  @Field(() => [UploadModel])
  uploads?: UploadModel[];

  @Field(() => [NotificationModel])
  notifications?: NotificationModel[];

  @Field(() => [AuditLogModel])
  auditLogs?: AuditLogModel[];

  @Field(() => [RefreshTokenModel])
  refreshTokens?: RefreshTokenModel[];

  @Field(() => [PasswordResetTokenModel])
  passwordResetTokens?: PasswordResetTokenModel[];

  @Field(() => [FriendshipModel])
  friendshipsRequested?: FriendshipModel[];

  @Field(() => [FriendshipModel])
  friendshipsReceived?: FriendshipModel[];

  @Field(() => [PostLikeModel])
  likes?: PostLikeModel[];

  @Field(() => [PostReportModel])
  reports?: PostReportModel[];
}

@ObjectType()
export class ProfileModel {
  @Field()
  id!: string;

  @Field()
  userId!: string;

  @Field()
  displayName!: string;

  @Field(() => String, { nullable: true })
  avatarUrl!: string | null;

  @Field(() => String, { nullable: true })
  bio!: string | null;

  @Field(() => String, { nullable: true })
  location!: string | null;

  @Field(() => String, { nullable: true })
  websiteUrl!: string | null;

  @Field(() => String, { nullable: true })
  level!: string | null;

  @Field(() => ProfileVisibility)
  visibility!: ProfileVisibility;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;

  @Field(() => UserModel)
  user?: UserModel;
}

@ObjectType()
export class PostModel {
  @Field()
  id!: string;

  @Field()
  authorId!: string;

  @Field(() => String, { nullable: true })
  content!: string | null;

  @Field(() => String, { nullable: true })
  coverImageUrl!: string | null;

  @Field(() => String, { nullable: true })
  audioUrl!: string | null;

  @Field(() => PostVisibility)
  visibility!: PostVisibility;

  @Field(() => Int)
  likeCount!: number;

  @Field(() => Int)
  commentCount!: number;

  @Field(() => PostStatus)
  status!: PostStatus;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  deletedAt!: Date | null;

  @Field(() => UserModel)
  author?: UserModel;

  @Field(() => [CommentModel])
  comments?: CommentModel[];

  @Field(() => [PostLikeModel])
  likes?: PostLikeModel[];

  @Field(() => [PostReportModel])
  reports?: PostReportModel[];

  @Field(() => [PostAttachmentModel])
  attachments?: PostAttachmentModel[];

  @Field(() => [PostTagModel])
  tags?: PostTagModel[];
}

@ObjectType()
export class CommentModel {
  @Field()
  id!: string;

  @Field()
  postId!: string;

  @Field()
  authorId!: string;

  @Field()
  content!: string;

  @Field(() => CommentStatus)
  status!: CommentStatus;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  deletedAt!: Date | null;

  @Field(() => PostModel)
  post?: PostModel;

  @Field(() => UserModel)
  author?: UserModel;
}

@ObjectType()
export class TagModel {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => [PostTagModel])
  postTags?: PostTagModel[];
}

@ObjectType()
export class FriendshipModel {
  @Field()
  id!: string;

  @Field()
  requesterId!: string;

  @Field()
  receiverId!: string;

  @Field(() => FriendshipStatus)
  status!: FriendshipStatus;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;

  @Field(() => UserModel)
  requester?: UserModel;

  @Field(() => UserModel)
  receiver?: UserModel;
}

@ObjectType()
export class UploadModel {
  @Field()
  id!: string;

  @Field()
  userId!: string;

  @Field()
  fileName!: string;

  @Field()
  fileType!: string;

  @Field()
  fileSize!: string;

  @Field()
  storagePath!: string;

  @Field(() => Int, { nullable: true })
  duration!: number | null;

  @Field(() => UploadStatus)
  status!: UploadStatus;

  @Field(() => UploadSourceType)
  sourceType!: UploadSourceType;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  deletedAt!: Date | null;

  @Field(() => UserModel)
  user?: UserModel;

  @Field(() => [PostAttachmentModel])
  attachments?: PostAttachmentModel[];
}

@ObjectType()
export class NotificationModel {
  @Field()
  id!: string;

  @Field()
  userId!: string;

  @Field(() => NotificationType)
  type!: NotificationType;

  @Field(() => GraphQLJSON)
  payload!: Prisma.JsonValue;

  @Field(() => GraphQLISODateTime, { nullable: true })
  readAt!: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => UserModel)
  user?: UserModel;
}

@ObjectType()
export class AuditLogModel {
  @Field()
  id!: string;

  @Field()
  actorId!: string;

  @Field()
  action!: string;

  @Field()
  entityType!: string;

  @Field(() => String, { nullable: true })
  entityId!: string | null;

  @Field(() => GraphQLJSON)
  metadata!: Prisma.JsonValue;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => UserModel)
  actor?: UserModel;
}

@ObjectType()
export class RefreshTokenModel {
  @Field()
  id!: string;

  @Field()
  userId!: string;

  @Field()
  tokenHash!: string;

  @Field(() => GraphQLISODateTime)
  expiresAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  revokedAt!: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => UserModel)
  user?: UserModel;
}

@ObjectType()
export class PasswordResetTokenModel {
  @Field()
  id!: string;

  @Field()
  userId!: string;

  @Field()
  tokenHash!: string;

  @Field(() => GraphQLISODateTime)
  expiresAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  usedAt!: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => PostModel)
  post?: PostModel;

  @Field(() => UserModel)
  user?: UserModel;
}

@ObjectType()
export class PostLikeModel {
  @Field()
  id!: string;

  @Field()
  postId!: string;

  @Field()
  userId!: string;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

@ObjectType()
export class PostReportModel {
  @Field()
  id!: string;

  @Field()
  postId!: string;

  @Field()
  reporterId!: string;

  @Field()
  reason!: string;

  @Field(() => ReportStatus)
  status!: ReportStatus;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  reviewedAt!: Date | null;

  @Field(() => PostModel)
  post?: PostModel;

  @Field(() => UserModel)
  reporter?: UserModel;
}

@ObjectType()
export class PostAttachmentModel {
  @Field()
  id!: string;

  @Field()
  postId!: string;

  @Field()
  uploadId!: string;

  @Field(() => AttachmentKind)
  kind!: AttachmentKind;

  @Field(() => Int)
  position!: number;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => PostModel)
  post?: PostModel;

  @Field(() => UploadModel)
  upload?: UploadModel;
}

@ObjectType()
export class PostTagModel {
  @Field()
  postId!: string;

  @Field()
  tagId!: string;

  @Field(() => PostModel)
  post?: PostModel;

  @Field(() => TagModel)
  tag?: TagModel;
}

@InputType()
export class CreateUserInput {
  @Field()
  email!: string;

  @Field()
  passwordHash!: string;

  @Field()
  username!: string;

  @Field(() => UserStatus, { nullable: true })
  status?: UserStatus;
}

@InputType()
export class UpdateUserInput extends PartialType(CreateUserInput) {}

@InputType()
export class CreateProfileInput {
  @Field()
  userId!: string;

  @Field()
  displayName!: string;

  @Field(() => String, { nullable: true })
  avatarUrl?: string | null;

  @Field(() => String, { nullable: true })
  bio?: string | null;

  @Field(() => String, { nullable: true })
  location?: string | null;

  @Field(() => String, { nullable: true })
  websiteUrl?: string | null;

  @Field(() => String, { nullable: true })
  level?: string | null;

  @Field(() => ProfileVisibility, { nullable: true })
  visibility?: ProfileVisibility;
}

@InputType()
export class UpdateProfileInput extends PartialType(CreateProfileInput) {}

@InputType()
export class CreatePostInput {
  @Field()
  authorId!: string;

  @Field(() => String, { nullable: true })
  content?: string | null;

  @Field(() => String, { nullable: true })
  coverImageUrl?: string | null;

  @Field(() => String, { nullable: true })
  audioUrl?: string | null;

  @Field(() => PostVisibility, { nullable: true })
  visibility?: PostVisibility;

  @Field(() => PostStatus, { nullable: true })
  status?: PostStatus;
}

@InputType()
export class UpdatePostInput extends PartialType(CreatePostInput) {}

@InputType()
export class CreateCommentInput {
  @Field()
  postId!: string;

  @Field()
  authorId!: string;

  @Field()
  content!: string;

  @Field(() => CommentStatus, { nullable: true })
  status?: CommentStatus;
}

@InputType()
export class UpdateCommentInput extends PartialType(CreateCommentInput) {}

@InputType()
export class CreateTagInput {
  @Field()
  name!: string;
}

@InputType()
export class UpdateTagInput extends PartialType(CreateTagInput) {}

@InputType()
export class CreateFriendshipInput {
  @Field()
  requesterId!: string;

  @Field()
  receiverId!: string;

  @Field(() => FriendshipStatus, { nullable: true })
  status?: FriendshipStatus;
}

@InputType()
export class UpdateFriendshipInput extends PartialType(CreateFriendshipInput) {}

@InputType()
export class CreateUploadInput {
  @Field()
  userId!: string;

  @Field()
  fileName!: string;

  @Field()
  fileType!: string;

  @Field()
  fileSize!: string;

  @Field()
  storagePath!: string;

  @Field(() => Number, { nullable: true })
  duration?: number | null;

  @Field(() => UploadStatus, { nullable: true })
  status?: UploadStatus;

  @Field(() => UploadSourceType, { nullable: true })
  sourceType?: UploadSourceType;
}

@InputType()
export class UpdateUploadInput extends PartialType(CreateUploadInput) {}

@InputType()
export class CreateNotificationInput {
  @Field()
  userId!: string;

  @Field(() => NotificationType)
  type!: NotificationType;

  @Field(() => GraphQLJSON)
  payload!: Prisma.InputJsonValue;

  @Field(() => GraphQLISODateTime, { nullable: true })
  readAt?: Date | null;
}

@InputType()
export class UpdateNotificationInput extends PartialType(
  CreateNotificationInput,
) {}

@InputType()
export class CreateAuditLogInput {
  @Field()
  actorId!: string;

  @Field()
  action!: string;

  @Field()
  entityType!: string;

  @Field(() => String, { nullable: true })
  entityId?: string | null;

  @Field(() => GraphQLJSON)
  metadata!: Prisma.InputJsonValue;
}

@InputType()
export class UpdateAuditLogInput extends PartialType(CreateAuditLogInput) {}

@InputType()
export class CreateRefreshTokenInput {
  @Field()
  userId!: string;

  @Field()
  tokenHash!: string;

  @Field(() => GraphQLISODateTime)
  expiresAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  revokedAt?: Date | null;
}

@InputType()
export class UpdateRefreshTokenInput extends PartialType(
  CreateRefreshTokenInput,
) {}

@InputType()
export class CreatePasswordResetTokenInput {
  @Field()
  userId!: string;

  @Field()
  tokenHash!: string;

  @Field(() => GraphQLISODateTime)
  expiresAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  usedAt?: Date | null;
}

@InputType()
export class UpdatePasswordResetTokenInput extends PartialType(
  CreatePasswordResetTokenInput,
) {}

@InputType()
export class CreatePostLikeInput {
  @Field()
  postId!: string;

  @Field()
  userId!: string;
}

@InputType()
export class UpdatePostLikeInput extends PartialType(CreatePostLikeInput) {}

@InputType()
export class CreatePostReportInput {
  @Field()
  postId!: string;

  @Field()
  reporterId!: string;

  @Field()
  reason!: string;

  @Field(() => ReportStatus, { nullable: true })
  status?: ReportStatus;

  @Field(() => GraphQLISODateTime, { nullable: true })
  reviewedAt?: Date | null;
}

@InputType()
export class UpdatePostReportInput extends PartialType(CreatePostReportInput) {}

@InputType()
export class CreatePostAttachmentInput {
  @Field()
  postId!: string;

  @Field()
  uploadId!: string;

  @Field(() => AttachmentKind)
  kind!: AttachmentKind;

  @Field(() => Int, { nullable: true })
  position?: number;
}

@InputType()
export class UpdatePostAttachmentInput extends PartialType(
  CreatePostAttachmentInput,
) {}

@InputType()
export class CreatePostTagInput {
  @Field()
  postId!: string;

  @Field()
  tagId!: string;
}

@InputType()
export class UpdatePostTagInput extends PartialType(CreatePostTagInput) {}

@InputType()
export class RegisterInput {
  @Field()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @Field()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username!: string;

  @Field()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

@InputType()
export class LoginInput {
  @Field()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}

@InputType()
export class VerifyEmailInput {
  @Field()
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  token!: string;

  @Field()
  @IsString()
  @MinLength(4)
  @MaxLength(4)
  code!: string;
}

@InputType()
export class GoogleAuthInput {
  @Field()
  @IsString()
  @MinLength(1)
  accessToken!: string;
}

@ObjectType()
export class AuthPayload {
  @Field()
  accessToken!: string;

  @Field(() => UserModel)
  user!: UserModel;
}

@ObjectType()
export class RegisterPendingPayload {
  @Field()
  email!: string;

  @Field()
  verificationToken!: string;

  @Field(() => GraphQLISODateTime)
  expiresAt!: Date;

  @Field()
  message!: string;
}
