import { Module } from '@nestjs/common';
import { GeniusModule } from '../genius/genius.module';
import { SpotifyModule } from '../spotify/spotify.module';
import { YouTubeModule } from '../youtube/youtube.module';
import { MusicResolver } from './music.resolver';
import { MusicService } from './music.service';

@Module({
  // Spotify stays registered for future use; YouTube is the active search source.
  imports: [SpotifyModule, YouTubeModule, GeniusModule],
  providers: [MusicService, MusicResolver],
  exports: [MusicService],
})
export class MusicModule {}
