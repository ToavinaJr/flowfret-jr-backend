import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { YOUTUBE_HTTP_TIMEOUT_MS } from './youtube.constants';
import { YouTubeService } from './youtube.service';

@Module({
  imports: [HttpModule.register({ timeout: YOUTUBE_HTTP_TIMEOUT_MS })],
  providers: [YouTubeService],
  exports: [YouTubeService],
})
export class YouTubeModule {}

