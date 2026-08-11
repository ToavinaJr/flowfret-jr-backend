import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import {
  AttachmentKind,
  CommentStatus,
  FriendshipStatus,
  NotificationType,
  PostStatus,
  PostVisibility,
  Prisma,
  ProfileVisibility,
  ReportStatus,
  UploadSourceType,
  UploadStatus,
  UserStatus,
} from '@prisma/client';
import { GraphQLJSON } from 'graphql-type-json';
import './enums';

@ObjectType()
export class UserModel {
  @Field() id!: string;
  @Field() email!: string;
  @Field() username!: string;
  @Field(() => String, { nullable: true }) googleId?: string | null;
  @Field(() => UserStatus) status!: UserStatus;
  @Field(() => GraphQLISODateTime, { nullable: true })
  lastLoginAt!: Date | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field(() => ProfileModel, { nullable: true }) profile?: ProfileModel | null;
  @Field(() => [PostModel]) authoredPosts?: PostModel[];
  @Field(() => [CommentModel]) comments?: CommentModel[];
  @Field(() => [UploadModel]) uploads?: UploadModel[];
  @Field(() => [NotificationModel]) notifications?: NotificationModel[];
  @Field(() => [AuditLogModel]) auditLogs?: AuditLogModel[];
  @Field(() => [RefreshTokenModel]) refreshTokens?: RefreshTokenModel[];
  @Field(() => [PasswordResetTokenModel])
  passwordResetTokens?: PasswordResetTokenModel[];
  @Field(() => [FriendshipModel]) friendshipsRequested?: FriendshipModel[];
  @Field(() => [FriendshipModel]) friendshipsReceived?: FriendshipModel[];
  @Field(() => [PostLikeModel]) likes?: PostLikeModel[];
  @Field(() => [PostReportModel]) reports?: PostReportModel[];
}

@ObjectType()
export class ProfileModel {
  @Field() id!: string;
  @Field() userId!: string;
  @Field() displayName!: string;
  @Field(() => String, { nullable: true }) avatarUrl!: string | null;
  @Field(() => String, { nullable: true }) bio!: string | null;
  @Field(() => String, { nullable: true }) location!: string | null;
  @Field(() => String, { nullable: true }) websiteUrl!: string | null;
  @Field(() => String, { nullable: true }) level!: string | null;
  @Field(() => ProfileVisibility) visibility!: ProfileVisibility;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field(() => UserModel) user?: UserModel;
}

@ObjectType()
export class PostModel {
  @Field() id!: string;
  @Field() authorId!: string;
  @Field(() => String, { nullable: true }) content!: string | null;
  @Field(() => String, { nullable: true }) coverImageUrl!: string | null;
  @Field(() => String, { nullable: true }) audioUrl!: string | null;
  @Field(() => PostVisibility) visibility!: PostVisibility;
  @Field(() => Int) likeCount!: number;
  @Field(() => Int) commentCount!: number;
  @Field(() => PostStatus) status!: PostStatus;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) deletedAt!: Date | null;
  @Field(() => UserModel) author?: UserModel;
  @Field(() => [CommentModel]) comments?: CommentModel[];
  @Field(() => [PostLikeModel]) likes?: PostLikeModel[];
  @Field(() => [PostReportModel]) reports?: PostReportModel[];
  @Field(() => [PostAttachmentModel]) attachments?: PostAttachmentModel[];
  @Field(() => [PostTagModel]) tags?: PostTagModel[];
}

@ObjectType()
export class CommentModel {
  @Field() id!: string;
  @Field() postId!: string;
  @Field() authorId!: string;
  @Field() content!: string;
  @Field(() => CommentStatus) status!: CommentStatus;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) deletedAt!: Date | null;
  @Field(() => PostModel) post?: PostModel;
  @Field(() => UserModel) author?: UserModel;
}

@ObjectType()
export class TagModel {
  @Field() id!: string;
  @Field() name!: string;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => [PostTagModel]) postTags?: PostTagModel[];
}

@ObjectType()
export class FriendshipModel {
  @Field() id!: string;
  @Field() requesterId!: string;
  @Field() receiverId!: string;
  @Field(() => FriendshipStatus) status!: FriendshipStatus;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field(() => UserModel) requester?: UserModel;
  @Field(() => UserModel) receiver?: UserModel;
}

@ObjectType()
export class UploadModel {
  @Field() id!: string;
  @Field() userId!: string;
  @Field() fileName!: string;
  @Field() fileType!: string;
  @Field() fileSize!: string;
  @Field() storagePath!: string;
  @Field(() => Int, { nullable: true }) duration!: number | null;
  @Field(() => UploadStatus) status!: UploadStatus;
  @Field(() => UploadSourceType) sourceType!: UploadSourceType;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) deletedAt!: Date | null;
  @Field(() => UserModel) user?: UserModel;
  @Field(() => [PostAttachmentModel]) attachments?: PostAttachmentModel[];
}

@ObjectType()
export class NotificationModel {
  @Field() id!: string;
  @Field() userId!: string;
  @Field(() => NotificationType) type!: NotificationType;
  @Field(() => GraphQLJSON) payload!: Prisma.JsonValue;
  @Field(() => GraphQLISODateTime, { nullable: true }) readAt!: Date | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => UserModel) user?: UserModel;
}

@ObjectType()
export class NotificationPreferenceModel {
  @Field() id!: string;
  @Field() userId!: string;
  @Field(() => NotificationType) type!: NotificationType;
  @Field() enabled!: boolean;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
}

@ObjectType()
export class AuditLogModel {
  @Field() id!: string;
  @Field() actorId!: string;
  @Field() action!: string;
  @Field() entityType!: string;
  @Field(() => String, { nullable: true }) entityId!: string | null;
  @Field(() => GraphQLJSON) metadata!: Prisma.JsonValue;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => UserModel) actor?: UserModel;
}

@ObjectType()
export class RefreshTokenModel {
  @Field() id!: string;
  @Field() userId!: string;
  @Field() tokenHash!: string;
  @Field(() => GraphQLISODateTime) expiresAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) revokedAt!: Date | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => UserModel) user?: UserModel;
}

@ObjectType()
export class PasswordResetTokenModel {
  @Field() id!: string;
  @Field() userId!: string;
  @Field() tokenHash!: string;
  @Field(() => GraphQLISODateTime) expiresAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) usedAt!: Date | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => PostModel) post?: PostModel;
  @Field(() => UserModel) user?: UserModel;
}

@ObjectType()
export class PostLikeModel {
  @Field() id!: string;
  @Field() postId!: string;
  @Field() userId!: string;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}

@ObjectType()
export class PostReportModel {
  @Field() id!: string;
  @Field() postId!: string;
  @Field() reporterId!: string;
  @Field() reason!: string;
  @Field(() => ReportStatus) status!: ReportStatus;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) reviewedAt!: Date | null;
  @Field(() => PostModel) post?: PostModel;
  @Field(() => UserModel) reporter?: UserModel;
}

@ObjectType()
export class PostAttachmentModel {
  @Field() id!: string;
  @Field() postId!: string;
  @Field() uploadId!: string;
  @Field(() => AttachmentKind) kind!: AttachmentKind;
  @Field(() => Int) position!: number;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => PostModel) post?: PostModel;
  @Field(() => UploadModel) upload?: UploadModel;
}

@ObjectType()
export class PostTagModel {
  @Field() postId!: string;
  @Field() tagId!: string;
  @Field(() => PostModel) post?: PostModel;
  @Field(() => TagModel) tag?: TagModel;
}
