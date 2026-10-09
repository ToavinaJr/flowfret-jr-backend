import {
  Field,
  Float,
  GraphQLISODateTime,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import {
  CommentStatus,
  MusicProvider,
  PlaylistVisibility,
  PostStatus,
  PostVisibility,
  Prisma,
  ReportStatus,
  TranscriptionStatus,
  UploadSourceType,
  UploadStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { GraphQLJSON } from 'graphql-type-json';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import '../graphql/types/enums';

export enum AdminSortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum AdminUserSortField {
  CREATED_AT = 'CREATED_AT',
  UPDATED_AT = 'UPDATED_AT',
  USERNAME = 'USERNAME',
  EMAIL = 'EMAIL',
  LAST_LOGIN_AT = 'LAST_LOGIN_AT',
}

registerEnumType(AdminSortDirection, { name: 'AdminSortDirection' });
registerEnumType(AdminUserSortField, { name: 'AdminUserSortField' });

@InputType()
export class AdminStatisticsInput {
  @Field(() => Int, { defaultValue: 30 })
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(365)
  days?: number;
}

@InputType()
export class AdminListInput {
  @Field(() => Int, { defaultValue: 25 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  first?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  after?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @Field({ defaultValue: false })
  @IsOptional()
  @IsBoolean()
  includeDeleted?: boolean;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsDateString()
  from?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsDateString()
  to?: string;

  @Field(() => AdminSortDirection, { defaultValue: AdminSortDirection.DESC })
  @IsOptional()
  @IsEnum(AdminSortDirection)
  direction?: AdminSortDirection;
}

@InputType()
export class AdminUsersInput extends AdminListInput {
  @Field(() => UserStatus, { nullable: true })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @Field(() => UserRole, { nullable: true })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @Field(() => AdminUserSortField, {
    defaultValue: AdminUserSortField.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(AdminUserSortField)
  sortBy?: AdminUserSortField;
}

@InputType()
export class AdminContentInput extends AdminListInput {
  @Field(() => PostStatus, { nullable: true })
  @IsOptional()
  @IsEnum(PostStatus)
  postStatus?: PostStatus;

  @Field(() => CommentStatus, { nullable: true })
  @IsOptional()
  @IsEnum(CommentStatus)
  commentStatus?: CommentStatus;

  @Field(() => ReportStatus, { nullable: true })
  @IsOptional()
  @IsEnum(ReportStatus)
  reportStatus?: ReportStatus;
}

@InputType()
export class AdminModerateReportInput {
  @Field()
  @IsUUID()
  reportId!: string;

  @Field(() => ReportStatus)
  @IsEnum(ReportStatus)
  status!: ReportStatus;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

@InputType()
export class AdminMediaInput extends AdminListInput {
  @Field(() => UploadStatus, { nullable: true })
  @IsOptional()
  @IsEnum(UploadStatus)
  uploadStatus?: UploadStatus;

  @Field(() => TranscriptionStatus, { nullable: true })
  @IsOptional()
  @IsEnum(TranscriptionStatus)
  transcriptionStatus?: TranscriptionStatus;

  @Field(() => MusicProvider, { nullable: true })
  @IsOptional()
  @IsEnum(MusicProvider)
  provider?: MusicProvider;
}

@InputType()
export class AdminMusicInput extends AdminListInput {
  @Field(() => MusicProvider, { nullable: true })
  @IsOptional()
  @IsEnum(MusicProvider)
  provider?: MusicProvider;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  userId?: string;
}

@InputType()
export class AdminAuditInput extends AdminListInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;
}

@InputType()
export class AdminSetUserRoleInput {
  @Field()
  @IsUUID()
  userId!: string;

  @Field(() => UserRole)
  @IsEnum(UserRole)
  role!: UserRole;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

@InputType()
export class AdminSetUserStatusInput {
  @Field()
  @IsUUID()
  userId!: string;

  @Field(() => UserStatus)
  @IsEnum(UserStatus)
  status!: UserStatus;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

@InputType()
export class AdminUserActionInput {
  @Field()
  @IsUUID()
  userId!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

@ObjectType()
export class AdminPageInfo {
  @Field() hasNextPage!: boolean;
  @Field() hasPreviousPage!: boolean;
  @Field(() => String, { nullable: true }) endCursor!: string | null;
}

@ObjectType()
export class AdminBackendStatus {
  @Field() databaseReachable!: boolean;
  @Field(() => GraphQLISODateTime) serverTime!: Date;
}

@ObjectType()
export class AdminDashboardTotals {
  @Field(() => Int) users!: number;
  @Field(() => Int) activeUsers!: number;
  @Field(() => Int) posts!: number;
  @Field(() => Int) comments!: number;
  @Field(() => Int) openReports!: number;
  @Field(() => Int) uploads!: number;
  @Field(() => Int) transcriptions!: number;
  @Field(() => Int) chordTranscriptions!: number;
  @Field(() => Int) playlists!: number;
  @Field(() => Int) catalogTracks!: number;
  @Field(() => Float) trackPlays!: number;
}

@ObjectType()
export class AdminDashboardPeriodTotals {
  @Field(() => Int) newUsers!: number;
  @Field(() => Int) newPosts!: number;
  @Field(() => Int) newComments!: number;
  @Field(() => Int) newUploads!: number;
  @Field(() => Int) newTranscriptions!: number;
  @Field(() => Int) reportsCreated!: number;
  @Field(() => Int) trackPlays!: number;
}

@ObjectType()
export class AdminDailyStatistic {
  @Field() date!: string;
  @Field(() => Int) users!: number;
  @Field(() => Int) posts!: number;
  @Field(() => Int) comments!: number;
  @Field(() => Int) reports!: number;
  @Field(() => Int) trackPlays!: number;
}

@ObjectType()
export class AdminCategoryStatistic {
  @Field() key!: string;
  @Field(() => Float) count!: number;
}

@ObjectType()
export class AdminDashboardStatistics {
  @Field(() => GraphQLISODateTime) generatedAt!: Date;
  @Field(() => GraphQLISODateTime) periodStart!: Date;
  @Field(() => GraphQLISODateTime) periodEnd!: Date;
  @Field(() => Int) days!: number;
  @Field(() => AdminDashboardTotals) totals!: AdminDashboardTotals;
  @Field(() => AdminDashboardPeriodTotals)
  period!: AdminDashboardPeriodTotals;
  @Field(() => [AdminDailyStatistic]) daily!: AdminDailyStatistic[];
  @Field(() => [AdminCategoryStatistic])
  usersByStatus!: AdminCategoryStatistic[];
  @Field(() => [AdminCategoryStatistic])
  transcriptionsByStatus!: AdminCategoryStatistic[];
  @Field(() => [AdminCategoryStatistic])
  playsByProvider!: AdminCategoryStatistic[];
}

@ObjectType()
export class AdminUserActivity {
  @Field(() => Int) posts!: number;
  @Field(() => Int) comments!: number;
  @Field(() => Int) playlists!: number;
  @Field(() => Int) uploads!: number;
}

@ObjectType()
export class AdminUser {
  @Field() id!: string;
  @Field() email!: string;
  @Field() username!: string;
  @Field(() => UserStatus) status!: UserStatus;
  @Field(() => UserRole) role!: UserRole;
  @Field(() => GraphQLISODateTime, { nullable: true })
  lastLoginAt!: Date | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field() isDeleted!: boolean;
  @Field(() => GraphQLISODateTime, { nullable: true }) deletedAt!: Date | null;
  @Field(() => String, { nullable: true }) displayName!: string | null;
  @Field(() => AdminUserActivity, { nullable: true })
  activity?: AdminUserActivity;
}

@ObjectType()
export class AdminUserConnection {
  @Field(() => [AdminUser]) nodes!: AdminUser[];
  @Field(() => Int) totalCount!: number;
  @Field(() => AdminPageInfo) pageInfo!: AdminPageInfo;
}

@ObjectType()
export class AdminUserSecurityResult {
  @Field(() => AdminUser) user!: AdminUser;
  @Field(() => Int) revokedSessionCount!: number;
  @Field() auditLogId!: string;
}

@ObjectType()
export class AdminPost {
  @Field() id!: string;
  @Field() authorId!: string;
  @Field() authorUsername!: string;
  @Field(() => String, { nullable: true }) content!: string | null;
  @Field(() => PostVisibility) visibility!: PostVisibility;
  @Field(() => PostStatus) status!: PostStatus;
  @Field(() => Int) likeCount!: number;
  @Field(() => Int) commentCount!: number;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field() isDeleted!: boolean;
  @Field(() => GraphQLISODateTime, { nullable: true }) deletedAt!: Date | null;
}

@ObjectType()
export class AdminPostConnection {
  @Field(() => [AdminPost]) nodes!: AdminPost[];
  @Field(() => Int) totalCount!: number;
  @Field(() => AdminPageInfo) pageInfo!: AdminPageInfo;
}

@ObjectType()
export class AdminComment {
  @Field() id!: string;
  @Field() postId!: string;
  @Field() authorId!: string;
  @Field() authorUsername!: string;
  @Field() content!: string;
  @Field(() => CommentStatus) status!: CommentStatus;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field() isDeleted!: boolean;
  @Field(() => GraphQLISODateTime, { nullable: true }) deletedAt!: Date | null;
}

@ObjectType()
export class AdminCommentConnection {
  @Field(() => [AdminComment]) nodes!: AdminComment[];
  @Field(() => Int) totalCount!: number;
  @Field(() => AdminPageInfo) pageInfo!: AdminPageInfo;
}

@ObjectType()
export class AdminPostReport {
  @Field() id!: string;
  @Field() postId!: string;
  @Field() reporterId!: string;
  @Field() reporterUsername!: string;
  @Field(() => String, { nullable: true }) postContent!: string | null;
  @Field() postAuthorUsername!: string;
  @Field(() => PostStatus) postStatus!: PostStatus;
  @Field(() => PostVisibility) postVisibility!: PostVisibility;
  @Field() postIsDeleted!: boolean;
  @Field() reason!: string;
  @Field(() => ReportStatus) status!: ReportStatus;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) reviewedAt!: Date | null;
  @Field() isDeleted!: boolean;
}

@ObjectType()
export class AdminPostReportConnection {
  @Field(() => [AdminPostReport]) nodes!: AdminPostReport[];
  @Field(() => Int) totalCount!: number;
  @Field(() => AdminPageInfo) pageInfo!: AdminPageInfo;
}

@ObjectType()
export class AdminUpload {
  @Field() id!: string;
  @Field() userId!: string;
  @Field() username!: string;
  @Field() fileName!: string;
  @Field() fileType!: string;
  @Field() fileSize!: string;
  @Field(() => UploadStatus) status!: UploadStatus;
  @Field(() => UploadSourceType) sourceType!: UploadSourceType;
  @Field() cleanupPending!: boolean;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field() isDeleted!: boolean;
}

@ObjectType()
export class AdminUploadConnection {
  @Field(() => [AdminUpload]) nodes!: AdminUpload[];
  @Field(() => Int) totalCount!: number;
  @Field(() => AdminPageInfo) pageInfo!: AdminPageInfo;
}

@ObjectType()
export class AdminTranscription {
  @Field() id!: string;
  @Field(() => MusicProvider) provider!: MusicProvider;
  @Field() trackId!: string;
  @Field(() => String, { nullable: true }) title!: string | null;
  @Field(() => String, { nullable: true }) artist!: string | null;
  @Field(() => TranscriptionStatus) status!: TranscriptionStatus;
  @Field(() => Int) progress!: number;
  @Field(() => String, { nullable: true }) errorCode!: string | null;
  @Field(() => String, { nullable: true }) errorMessage!: string | null;
  @Field(() => Int) attempts!: number;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field() isDeleted!: boolean;
}

@ObjectType()
export class AdminTranscriptionConnection {
  @Field(() => [AdminTranscription]) nodes!: AdminTranscription[];
  @Field(() => Int) totalCount!: number;
  @Field(() => AdminPageInfo) pageInfo!: AdminPageInfo;
}

@ObjectType()
export class AdminChordTranscription {
  @Field() id!: string;
  @Field(() => MusicProvider) provider!: MusicProvider;
  @Field() providerTrackId!: string;
  @Field(() => String, { nullable: true }) title!: string | null;
  @Field(() => String, { nullable: true }) artist!: string | null;
  @Field() duration!: number;
  @Field(() => Int) cueCount!: number;
  @Field() engineVersion!: string;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
}

@ObjectType()
export class AdminChordTranscriptionConnection {
  @Field(() => [AdminChordTranscription]) nodes!: AdminChordTranscription[];
  @Field(() => Int) totalCount!: number;
  @Field(() => AdminPageInfo) pageInfo!: AdminPageInfo;
}

@ObjectType()
export class AdminPlaylist {
  @Field() id!: string;
  @Field() userId!: string;
  @Field() username!: string;
  @Field() name!: string;
  @Field(() => String, { nullable: true }) description!: string | null;
  @Field(() => PlaylistVisibility) visibility!: PlaylistVisibility;
  @Field(() => Int) itemCount!: number;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field() isDeleted!: boolean;
}

@ObjectType()
export class AdminPlaylistConnection {
  @Field(() => [AdminPlaylist]) nodes!: AdminPlaylist[];
  @Field(() => Int) totalCount!: number;
  @Field(() => AdminPageInfo) pageInfo!: AdminPageInfo;
}

@ObjectType()
export class AdminCatalogTrack {
  @Field() id!: string;
  @Field(() => MusicProvider) provider!: MusicProvider;
  @Field() providerTrackId!: string;
  @Field() title!: string;
  @Field(() => GraphQLJSON) artists!: Prisma.JsonValue;
  @Field(() => String, { nullable: true }) album!: string | null;
  @Field(() => String, { nullable: true }) genre!: string | null;
  @Field(() => Int) durationMs!: number;
  @Field(() => Int) playlistCount!: number;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
}

@ObjectType()
export class AdminCatalogTrackConnection {
  @Field(() => [AdminCatalogTrack]) nodes!: AdminCatalogTrack[];
  @Field(() => Int) totalCount!: number;
  @Field(() => AdminPageInfo) pageInfo!: AdminPageInfo;
}

@ObjectType()
export class AdminListeningHistory {
  @Field() id!: string;
  @Field() userId!: string;
  @Field() username!: string;
  @Field(() => MusicProvider) provider!: MusicProvider;
  @Field() providerTrackId!: string;
  @Field() title!: string;
  @Field(() => GraphQLJSON) artists!: Prisma.JsonValue;
  @Field(() => Int) playCount!: number;
  @Field(() => GraphQLISODateTime) lastPlayedAt!: Date;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}

@ObjectType()
export class AdminListeningHistoryConnection {
  @Field(() => [AdminListeningHistory]) nodes!: AdminListeningHistory[];
  @Field(() => Int) totalCount!: number;
  @Field(() => AdminPageInfo) pageInfo!: AdminPageInfo;
}

@ObjectType()
export class AdminAuditLog {
  @Field() id!: string;
  @Field() actorId!: string;
  @Field() actorUsername!: string;
  @Field() action!: string;
  @Field() entityType!: string;
  @Field(() => String, { nullable: true }) entityId!: string | null;
  @Field(() => GraphQLJSON) metadata!: Prisma.JsonValue;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}

@ObjectType()
export class AdminAuditLogConnection {
  @Field(() => [AdminAuditLog]) nodes!: AdminAuditLog[];
  @Field(() => Int) totalCount!: number;
  @Field(() => AdminPageInfo) pageInfo!: AdminPageInfo;
}
