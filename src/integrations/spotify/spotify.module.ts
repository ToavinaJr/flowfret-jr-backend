import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SPOTIFY_HTTP_TIMEOUT_MS } from './spotify.constants';
import { SpotifyService } from './spotify.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: SPOTIFY_HTTP_TIMEOUT_MS,
      maxRedirects: 3,
    }),
  ],
  providers: [SpotifyService],
  exports: [SpotifyService],
})
export class SpotifyModule {}
