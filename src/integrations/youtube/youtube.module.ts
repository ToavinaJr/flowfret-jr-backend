import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { YOUTUBE_HTTP_TIMEOUT_MS } from './youtube.constants';
import { YouTubeService } from './youtube.service';
import { YouTubeAudioController } from './youtube-audio.controller';
import { YouTubeAudioService } from './youtube-audio.service';

@Module({
  imports: [HttpModule.register({ timeout: YOUTUBE_HTTP_TIMEOUT_MS })],
  controllers: [YouTubeAudioController],
  providers: [YouTubeService, YouTubeAudioService],
  exports: [YouTubeService],
})
export class YouTubeModule {}
