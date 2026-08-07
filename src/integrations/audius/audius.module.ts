import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AUDIUS_HTTP_TIMEOUT_MS } from './audius.constants';
import { AudiusService } from './audius.service';

@Module({
  imports: [HttpModule.register({ timeout: AUDIUS_HTTP_TIMEOUT_MS })],
  providers: [AudiusService],
  exports: [AudiusService],
})
export class AudiusModule {}
