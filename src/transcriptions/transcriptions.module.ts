import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRedisOptions } from '../common/redis-config';
import { AudiusModule } from '../integrations/audius/audius.module';
import { TRANSCRIPTION_QUEUE } from './transcriptions.constants';
import { TranscriptionsController } from './transcriptions.controller';
import { TranscriptionEvents } from './transcriptions.events';
import { TranscriptionsRepository } from './transcriptions.repository';
import { TranscriptionsService } from './transcriptions.service';

@Module({
  imports: [
    AudiusModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: getRedisOptions(config),
      }),
    }),
    BullModule.registerQueue({ name: TRANSCRIPTION_QUEUE }),
  ],
  controllers: [TranscriptionsController],
  providers: [
    TranscriptionsService,
    TranscriptionsRepository,
    TranscriptionEvents,
  ],
})
export class TranscriptionsModule {}
