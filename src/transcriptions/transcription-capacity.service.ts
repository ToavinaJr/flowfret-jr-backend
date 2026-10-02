import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranscriptionQueueService } from './transcription-queue.service';
import { TRANSCRIPTION_ERROR_CODE } from './transcriptions.constants';

@Injectable()
export class TranscriptionCapacityService {
  constructor(
    private readonly config: ConfigService,
    private readonly queue: TranscriptionQueueService,
  ) {}

  async ensure(): Promise<void> {
    const counts = await this.queue.jobCounts('waiting', 'active', 'delayed');
    const queued =
      (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
    if (queued >= this.numberConfig('TRANSCRIPTION_MAX_QUEUE_DEPTH', 50))
      throw new ServiceUnavailableException({
        code: TRANSCRIPTION_ERROR_CODE.QUEUE_SATURATED,
        message: 'La file de transcription est temporairement saturÃ©e.',
      });
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
