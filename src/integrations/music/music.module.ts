import { Module } from '@nestjs/common';
import { GeniusModule } from '../genius/genius.module';
import { SpotifyModule } from '../spotify/spotify.module';
import { MusicResolver } from './music.resolver';
import { MusicService } from './music.service';

@Module({
  imports: [SpotifyModule, GeniusModule],
  providers: [MusicService, MusicResolver],
  exports: [MusicService],
})
export class MusicModule {}
