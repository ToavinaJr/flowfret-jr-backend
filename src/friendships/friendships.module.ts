import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { FriendshipsCommandService } from './friendships-command.service';
import { FriendshipsQueryService } from './friendships-query.service';
import { FriendshipsResolver } from './friendships.resolver';

@Module({
  imports: [NotificationsModule],
  providers: [
    FriendshipsResolver,
    FriendshipsCommandService,
    FriendshipsQueryService,
  ],
})
export class FriendshipsModule {}
