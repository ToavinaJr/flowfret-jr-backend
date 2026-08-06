import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GENIUS_HTTP_TIMEOUT_MS } from './genius.constants';
import { GeniusService } from './genius.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: GENIUS_HTTP_TIMEOUT_MS,
      maxRedirects: 3,
    }),
  ],
  providers: [GeniusService],
  exports: [GeniusService],
})
export class GeniusModule {}
