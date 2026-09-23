import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CommentsModule } from '../comments/comments.module';
import { FriendshipsModule } from '../friendships/friendships.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PostInteractionsModule } from '../post-interactions/post-interactions.module';
import { PostsModule } from '../posts/posts.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    ProfilesModule,
    PostsModule,
    CommentsModule,
    FriendshipsModule,
    NotificationsModule,
    PostInteractionsModule,
    AuditLogsModule,
  ],
})
export class SocialModule {}
