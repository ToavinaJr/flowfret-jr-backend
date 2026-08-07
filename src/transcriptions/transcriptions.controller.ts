import {
  Body,
  Controller,
  Get,
  Header,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { map, Observable } from 'rxjs';
import { CreateTranscriptionDto } from './dto/create-transcription.dto';
import { RetryTranscriptionDto } from './dto/retry-transcription.dto';
import { TranscriptionEvents } from './transcriptions.events';
import { TranscriptionsService } from './transcriptions.service';

@Controller('api/transcriptions')
@UseGuards(AuthGuard('jwt'))
export class TranscriptionsController {
  constructor(
    private readonly service: TranscriptionsService,
    private readonly events: TranscriptionEvents,
  ) {}

  @Post()
  create(@Body() dto: CreateTranscriptionDto) {
    return this.service.createOrGet(dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Sse(':id/events')
  async stream(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Observable<MessageEvent>> {
    const snapshot = await this.service.getEventSnapshot(id);
    return this.events
      .subscribe(id, snapshot)
      .pipe(map((event): MessageEvent => ({ type: event.type, data: event })));
  }

  @Get(':id/lrc')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async lrc(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.service.getLrc(id);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    response.send(file.content);
  }

  @Post(':id/retry')
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RetryTranscriptionDto,
  ) {
    return this.service.retry(id, dto.audioUrl);
  }
}
