import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRedisOptions } from '../common/redis-config';
import { AUDIO_STEMS_QUEUE } from './stems.constants';
import { StemsController } from './stems.controller';
import { StemsRepository } from './stems.repository';
import { StemsService } from './stems.service';
import { StemsQueueService } from './stems-queue.service';
import { StemsCapacityService } from './stems-capacity.service';
import { StemsWorkflowService } from './stems-workflow.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: getRedisOptions(config),
      }),
    }),
    BullModule.registerQueue({ name: AUDIO_STEMS_QUEUE }),
  ],
  controllers: [StemsController],
  providers: [
    StemsService,
    StemsQueueService,
    StemsCapacityService,
    StemsWorkflowService,
    StemsRepository,
  ],
})
export class StemsModule {}
