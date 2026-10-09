import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { GeniusModule } from '../genius/genius.module';
import { LyricsAlignmentService } from './lyrics-alignment.service';
import { LyricsCacheService } from './lyrics-cache.service';
import { LyricsController } from './lyrics.controller';
import { LyricsService } from './lyrics.service';
import { GeniusLyricsProvider } from './providers/genius-lyrics.provider';
import { LrclibProvider } from './providers/lrclib.provider';

@Module({
  imports: [HttpModule, GeniusModule],
  controllers: [LyricsController],
  providers: [
    LyricsService,
    LyricsCacheService,
    LyricsAlignmentService,
    LrclibProvider,
    GeniusLyricsProvider,
  ],
  exports: [LyricsService, LyricsAlignmentService],
})
export class LyricsModule {}
