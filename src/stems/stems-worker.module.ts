import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AudiusModule } from '../integrations/audius/audius.module';
import { YouTubeModule } from '../integrations/youtube/youtube.module';
import { PrismaModule } from '../prisma/prisma.module';
import { validateEnvironment } from '../common/validate-environment';
import { getRedisOptions } from '../common/redis-config';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { AUDIO_STEMS_QUEUE } from './stems.constants';
import { StemsRepository } from './stems.repository';
import { StemsAudioSourceService } from './stems-audio-source.service';
import { StemsBridgeService } from './stems-bridge.service';
import { StemsWorkerConfigService } from './stems-worker-config.service';
import { StemsProcessor } from './stems.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (environment) =>
        validateEnvironment(environment, {
          requireMail: false,
          requireWeb: false,
        }),
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}.local`,
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env.local',
        '.env',
      ],
    }),
    PrismaModule,
    AudiusModule,
    YouTubeModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: getRedisOptions(config),
      }),
    }),
    BullModule.registerQueue({ name: AUDIO_STEMS_QUEUE }),
  ],
  providers: [
    StemsRepository,
    StemsAudioSourceService,
    StemsBridgeService,
    StemsWorkerConfigService,
    CloudinaryService,
    StemsProcessor,
  ],
})
export class StemsWorkerModule {}
