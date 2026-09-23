import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AudiusModule } from '../integrations/audius/audius.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TRANSCRIPTION_QUEUE } from './transcriptions.constants';
import { TranscriptionEvents } from './transcriptions.events';
import { TranscriptionsProcessor } from './transcriptions.processor';
import { TranscriptionsRepository } from './transcriptions.repository';
import { WhisperBridgeService } from './whisper-bridge.service';
import { validateEnvironment } from '../common/validate-environment';
import { getRedisOptions } from '../common/redis-config';
import { TranscriptionMessageHandler } from './transcription-message-handler.service';
import { WhisperWorkerConfigService } from './whisper-worker-config.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (environment) =>
        validateEnvironment(environment, { requireMail: false }),
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}.local`,
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env.local',
        '.env',
      ],
    }),
    PrismaModule,
    AudiusModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: getRedisOptions(config),
      }),
    }),
    BullModule.registerQueue({ name: TRANSCRIPTION_QUEUE }),
  ],
  providers: [
    TranscriptionsRepository,
    TranscriptionEvents,
    WhisperBridgeService,
    WhisperWorkerConfigService,
    TranscriptionMessageHandler,
    TranscriptionsProcessor,
  ],
})
export class TranscriptionsWorkerModule {}
