import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { LyricsCacheService } from './lyrics-cache.service';
import { LyricsController } from './lyrics.controller';
import { LyricsService } from './lyrics.service';
import { LrclibProvider } from './providers/lrclib.provider';

@Module({
  imports: [HttpModule],
  controllers: [LyricsController],
  providers: [LyricsService, LyricsCacheService, LrclibProvider],
  exports: [LyricsService],
})
export class LyricsModule {}
