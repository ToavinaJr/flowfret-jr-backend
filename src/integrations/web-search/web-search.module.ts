import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { BING_SEARCH_HTTP_TIMEOUT_MS } from './web-search.constants';
import { BingSearchService } from './bing-search.service';

@Module({
  imports: [HttpModule.register({ timeout: BING_SEARCH_HTTP_TIMEOUT_MS })],
  providers: [BingSearchService],
  exports: [BingSearchService],
})
export class WebSearchModule {}
