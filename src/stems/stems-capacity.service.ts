import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StemsQueueService } from './stems-queue.service';
import { STEMS_ERROR_CODE } from './stems.constants';

@Injectable()
export class StemsCapacityService {
  constructor(
    private readonly config: ConfigService,
    private readonly queue: StemsQueueService,
  ) {}

  async ensure(): Promise<void> {
    const counts = await this.queue.jobCounts('waiting', 'active', 'delayed');
    const queued =
      (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
    if (queued >= this.numberConfig('AUDIO_STEMS_MAX_QUEUE_DEPTH', 20))
      throw new ServiceUnavailableException({
        code: STEMS_ERROR_CODE.QUEUE_SATURATED,
        message: 'La file de séparation vocale est temporairement saturée.',
      });
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
