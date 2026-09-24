import { Module } from '@nestjs/common';
import { AudiusModule } from '../audius/audius.module';
import { GeniusModule } from '../genius/genius.module';
import { SpotifyModule } from '../spotify/spotify.module';
import { YouTubeModule } from '../youtube/youtube.module';
import { MusicResolver } from './music.resolver';
import { MusicService } from './music.service';
import { MusicEnrichmentService } from './music-enrichment.service';
import { ListeningHistoryService } from './listening-history.service';

@Module({
  // MusicService selects the active provider through MUSIC_PROVIDER.
  imports: [AudiusModule, SpotifyModule, YouTubeModule, GeniusModule],
  providers: [
    MusicService,
    MusicEnrichmentService,
    ListeningHistoryService,
    MusicResolver,
  ],
  exports: [MusicService],
})
export class MusicModule {}
