import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AzureOpenAiModule } from '../azure-openai/azure-openai.module';
import { GeniusModule } from '../genius/genius.module';
import { WebSearchModule } from '../web-search/web-search.module';
import { LyricsCacheService } from './lyrics-cache.service';
import { LyricsController } from './lyrics.controller';
import { LyricsService } from './lyrics.service';
import { GeniusLyricsProvider } from './providers/genius-lyrics.provider';
import { LlmWebSearchLyricsProvider } from './providers/llm-web-search-lyrics.provider';
import { LrclibProvider } from './providers/lrclib.provider';
import { TononkiraLyricsProvider } from './providers/tononkira-lyrics.provider';

@Module({
  imports: [HttpModule, GeniusModule, WebSearchModule, AzureOpenAiModule],
  controllers: [LyricsController],
  providers: [
    LyricsService,
    LyricsCacheService,
    LrclibProvider,
    GeniusLyricsProvider,
    TononkiraLyricsProvider,
    LlmWebSearchLyricsProvider,
  ],
  exports: [LyricsService],
})
export class LyricsModule {}
