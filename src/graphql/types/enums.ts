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
  UploadSourceType,
  UploadStatus,
  UserStatus,
  UserRole,
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
registerEnumType(AttachmentKind, { name: 'AttachmentKind' });
