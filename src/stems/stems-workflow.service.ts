import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudioStemStatus, MusicProvider, Prisma } from '@prisma/client';
import { CreateAudioStemDto } from './dto/create-audio-stem.dto';
import {
  DEFAULT_STEMS_ENGINE_VERSION,
  STEMS_ERROR_CODE,
} from './stems.constants';
import { StemsCapacityService } from './stems-capacity.service';
import { StemsQueueService } from './stems-queue.service';
import { StemsRepository } from './stems.repository';
import { AudioStemResponse, toAudioStemResponse } from './stem.presenter';

@Injectable()
export class StemsWorkflowService {
  private readonly logger = new Logger(StemsWorkflowService.name);
  private readonly engineVersion: string;

  constructor(
    private readonly repository: StemsRepository,
    private readonly config: ConfigService,
    private readonly queue: StemsQueueService,
    private readonly capacity: StemsCapacityService,
  ) {
    this.engineVersion =
      this.config.get<string>('DEMUCS_ENGINE_VERSION') ??
      DEFAULT_STEMS_ENGINE_VERSION;
  }

  async createOrGet(dto: CreateAudioStemDto): Promise<AudioStemResponse> {
    const provider = dto.provider ?? MusicProvider.AUDIUS;
    this.logger.log(
      JSON.stringify({
        event: 'audio_stems.requested',
        trackId: dto.trackId,
        provider,
      }),
    );
    let item = await this.repository.findCompatible(
      provider,
      dto.trackId,
      this.engineVersion,
    );
    let created = false;
    if (!item) {
      await this.capacity.ensure();
      try {
        item = await this.repository.create({
          provider,
          trackId: dto.trackId,
          title: dto.title,
          artist: dto.artist,
          engineVersion: this.engineVersion,
        });
        created = true;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
        item = await this.repository.findCompatible(
          provider,
          dto.trackId,
          this.engineVersion,
        );
        if (!item) throw error;
      }
    }
    if (item.status === AudioStemStatus.COMPLETED)
      return toAudioStemResponse(item, true);
    if (item.status === AudioStemStatus.FAILED) {
      if (item.attempts >= 3)
        throw new ConflictException({
          code: STEMS_ERROR_CODE.ALREADY_RUNNING,
          message: 'Retry limit reached for vocal separation',
        });
      item = await this.repository.update(item.id, {
        status: AudioStemStatus.PENDING,
        errorCode: null,
        errorMessage: null,
      });
    }
    if (created || item.status === AudioStemStatus.PENDING)
      await this.queue.enqueue(item, dto.audioUrl);
    return toAudioStemResponse(item, false);
  }
}
