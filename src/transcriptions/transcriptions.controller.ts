import {
  Body,
  Controller,
  Get,
  Header,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  Sse,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { map, Observable } from 'rxjs';
import { CreateTranscriptionDto } from './dto/create-transcription.dto';
import { RetryTranscriptionDto } from './dto/retry-transcription.dto';
import { TranscriptionEvents } from './transcriptions.events';
import { TranscriptionsService } from './transcriptions.service';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { RateLimits } from '../auth/rate-limit.decorator';

@Controller('api/transcriptions')
@UseGuards(AuthGuard('jwt'))
export class TranscriptionsController {
  constructor(
    private readonly service: TranscriptionsService,
    private readonly events: TranscriptionEvents,
  ) {}

  @Post()
  @RateLimits(
    { limit: 5, windowSeconds: 60, failClosed: true },
    { limit: 20, windowSeconds: 86_400, failClosed: true },
  )
  create(
    @Body() dto: CreateTranscriptionDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.service.createOrGet(dto, req.user.sub);
  }

  @Get()
  list(
    @Req() req: { user: { sub: string } },
    @Query('take') take?: string,
  ) {
    const parsed = Number(take ?? 20);
    return this.service.list(
      req.user.sub,
      Number.isInteger(parsed) ? parsed : 20,
    );
  }

  @Get('diagnostics/queue')
  @Roles(UserRole.ADMIN)
  diagnostics() {
    return this.service.diagnostics();
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { sub: string } },
  ) {
    return this.service.get(id, req.user.sub);
  }

  @Sse(':id/events')
  stream(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { sub: string } },
  ): Observable<MessageEvent> {
    return this.events
      .subscribe(id, () => this.service.getEventSnapshot(id, req.user.sub))
      .pipe(map((event): MessageEvent => ({ type: event.type, data: event })));
  }

  @Get(':id/lrc')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async lrc(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
    @Req() req: { user: { sub: string } },
  ): Promise<void> {
    const file = await this.service.getLrc(id, req.user.sub);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    response.send(file.content);
  }

  @Post(':id/retry')
  @RateLimits(
    { limit: 3, windowSeconds: 3600, failClosed: true },
    { limit: 5, windowSeconds: 86_400, failClosed: true },
  )
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RetryTranscriptionDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.service.retry(id, dto.audioUrl, req.user.sub);
  }
}
