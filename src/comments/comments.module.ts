import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommentsCommandService } from './comments-command.service';
import { CommentsQueryService } from './comments-query.service';
import { CommentsResolver } from './comments.resolver';

@Module({
  imports: [NotificationsModule],
  providers: [CommentsResolver, CommentsCommandService, CommentsQueryService],
})
export class CommentsModule {}
