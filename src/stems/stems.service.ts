import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAudioStemDto } from './dto/create-audio-stem.dto';
import { StemsRepository } from './stems.repository';
import { StemsWorkflowService } from './stems-workflow.service';
import { AudioStemResponse, toAudioStemResponse } from './stem.presenter';
import { STEMS_ERROR_CODE } from './stems.constants';

export type { AudioStemResponse } from './stem.presenter';

@Injectable()
export class StemsService {
  constructor(
    private readonly workflow: StemsWorkflowService,
    private readonly repository: StemsRepository,
  ) {}

  createOrGet(dto: CreateAudioStemDto): Promise<AudioStemResponse> {
    return this.workflow.createOrGet(dto);
  }

  async get(id: string): Promise<AudioStemResponse> {
    const item = await this.repository.findById(id);
    if (!item || item.isDeleted)
      throw new NotFoundException({
        code: STEMS_ERROR_CODE.NOT_FOUND,
        message: 'Audio stem not found',
      });
    return toAudioStemResponse(item, item.status === 'COMPLETED');
  }
}
