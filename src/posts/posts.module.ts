import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';
import { PostsCommandService } from './posts-command.service';
import { PostsQueryService } from './posts-query.service';
import { PostsResolver } from './posts.resolver';

@Module({
  imports: [NotificationsModule, UploadsModule],
  providers: [PostsResolver, PostsCommandService, PostsQueryService],
})
export class PostsModule {}
