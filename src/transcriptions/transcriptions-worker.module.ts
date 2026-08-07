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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
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
        connection: {
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: Number(config.get('REDIS_PORT') ?? 6379),
          username: config.get<string>('REDIS_USERNAME') || undefined,
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          tls: config.get<string>('REDIS_TLS') === 'true' ? {} : undefined,
          maxRetriesPerRequest: null,
        },
      }),
    }),
    BullModule.registerQueue({ name: TRANSCRIPTION_QUEUE }),
  ],
  providers: [
    TranscriptionsRepository,
    TranscriptionEvents,
    WhisperBridgeService,
    TranscriptionsProcessor,
  ],
})
export class TranscriptionsWorkerModule {}
