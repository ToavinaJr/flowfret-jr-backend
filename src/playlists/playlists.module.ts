import { Module } from '@nestjs/common';
import { PlaylistAccessService } from './playlist-access.service';
import { PlaylistCommandService } from './playlist-command.service';
import { PlaylistInputService } from './playlist-input.service';
import { PlaylistItemsCommandService } from './playlist-items-command.service';
import { PlaylistQueryService } from './playlist-query.service';
import { PlaylistsResolver } from './playlists.resolver';
import { PlaylistsService } from './playlists.service';

@Module({
  providers: [
    PlaylistsResolver,
    PlaylistsService,
    PlaylistAccessService,
    PlaylistCommandService,
    PlaylistInputService,
    PlaylistItemsCommandService,
    PlaylistQueryService,
  ],
  exports: [PlaylistsService],
})
export class PlaylistsModule {}
