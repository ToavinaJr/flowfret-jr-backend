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
import { TranscriptionAccessService } from './transcription-access.service';
import { TranscriptionQueueService } from './transcription-queue.service';
import { TranscriptionWorkflowService } from './transcription-workflow.service';
import { TranscriptionQueueDiagnosticsService } from './transcription-queue-diagnostics.service';
import { TranscriptionCapacityService } from './transcription-capacity.service';

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
    TranscriptionAccessService,
    TranscriptionQueueService,
    TranscriptionQueueDiagnosticsService,
    TranscriptionCapacityService,
    TranscriptionWorkflowService,
    TranscriptionsRepository,
    TranscriptionEvents,
  ],
})
export class TranscriptionsModule {}
