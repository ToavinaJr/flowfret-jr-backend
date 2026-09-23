import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PostAttachmentsResolver } from './post-attachment-fields.resolver';
import { PostInteractionsQueryService } from './post-interactions-query.service';
import { PostInteractionsResolver } from './post-interactions.resolver';
import { PostLikeFieldsResolver } from './post-like-fields.resolver';
import { PostLikesService } from './post-likes.service';
import { PostModerationService } from './post-moderation.service';
import { PostReportsResolver } from './post-report-fields.resolver';

@Module({
  imports: [NotificationsModule],
  providers: [
    PostInteractionsResolver,
    PostInteractionsQueryService,
    PostLikesService,
    PostModerationService,
    PostLikeFieldsResolver,
    PostReportsResolver,
    PostAttachmentsResolver,
  ],
})
export class PostInteractionsModule {}
