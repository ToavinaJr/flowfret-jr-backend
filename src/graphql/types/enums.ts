import { registerEnumType } from '@nestjs/graphql';
import {
  AttachmentKind,
  CommentStatus,
  FriendshipStatus,
  MusicProvider,
  NotificationType,
  PlaylistVisibility,
  PostStatus,
  PostVisibility,
  ProfileVisibility,
  ReportStatus,
  TranscriptionStatus,
  UploadSourceType,
  UploadStatus,
  UserStatus,
  UserRole,
  InstructorStatus,
  TeachingCourseFormat,
  TeachingMode,
  TeachingCourseStatus,
  TeachingPriceUnit,
  TeachingEnrollmentStatus,
} from '@prisma/client';

registerEnumType(UserStatus, { name: 'UserStatus' });
registerEnumType(UserRole, { name: 'UserRole' });
registerEnumType(ProfileVisibility, { name: 'ProfileVisibility' });
registerEnumType(PostVisibility, { name: 'PostVisibility' });
registerEnumType(PostStatus, { name: 'PostStatus' });
registerEnumType(CommentStatus, { name: 'CommentStatus' });
registerEnumType(FriendshipStatus, { name: 'FriendshipStatus' });
registerEnumType(MusicProvider, { name: 'MusicProvider' });
registerEnumType(PlaylistVisibility, { name: 'PlaylistVisibility' });
registerEnumType(UploadStatus, { name: 'UploadStatus' });
registerEnumType(UploadSourceType, { name: 'UploadSourceType' });
registerEnumType(NotificationType, { name: 'NotificationType' });
registerEnumType(ReportStatus, { name: 'ReportStatus' });
registerEnumType(TranscriptionStatus, { name: 'TranscriptionStatus' });
registerEnumType(AttachmentKind, { name: 'AttachmentKind' });
registerEnumType(InstructorStatus, { name: 'InstructorStatus' });
registerEnumType(TeachingCourseFormat, { name: 'TeachingCourseFormat' });
registerEnumType(TeachingMode, { name: 'TeachingMode' });
registerEnumType(TeachingCourseStatus, { name: 'TeachingCourseStatus' });
registerEnumType(TeachingPriceUnit, { name: 'TeachingPriceUnit' });
registerEnumType(TeachingEnrollmentStatus, { name: 'TeachingEnrollmentStatus' });
