import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranscriptionsRepository } from './transcriptions.repository';
import { TranscriptionQueueService } from './transcription-queue.service';

@Injectable()
export class TranscriptionCapacityService {
  constructor(
    private readonly repository: TranscriptionsRepository,
    private readonly config: ConfigService,
    private readonly queue: TranscriptionQueueService,
  ) {}

  async ensure(userId: string): Promise<void> {
    const active = await this.repository.countActiveForUser(userId);
    if (active >= this.numberConfig('TRANSCRIPTION_MAX_ACTIVE_PER_USER', 2))
      throw new HttpException(
        {
          code: 'TRANSCRIPTION_USER_QUOTA_REACHED',
          message: 'Trop de transcriptions sont déjà en cours.',
        },
        429,
      );
    const counts = await this.queue.jobCounts('waiting', 'active', 'delayed');
    const queued =
      (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
    if (queued >= this.numberConfig('TRANSCRIPTION_MAX_QUEUE_DEPTH', 50))
      throw new ServiceUnavailableException({
        code: 'TRANSCRIPTION_QUEUE_SATURATED',
        message: 'La file de transcription est temporairement saturée.',
      });
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
