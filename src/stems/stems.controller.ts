import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateAudioStemDto } from './dto/create-audio-stem.dto';
import { StemsService } from './stems.service';
import { RateLimits } from '../auth/rate-limit.decorator';

@Controller('api/audio-stems')
@UseGuards(AuthGuard('jwt'))
export class StemsController {
  constructor(private readonly service: StemsService) {}

  @Post()
  @RateLimits(
    { limit: 10, windowSeconds: 60, failClosed: true, identity: 'ip' },
    { limit: 40, windowSeconds: 3600, failClosed: true, identity: 'ip' },
    { limit: 5, windowSeconds: 60, failClosed: true, identity: 'user' },
    { limit: 40, windowSeconds: 3600, failClosed: true, identity: 'user' },
  )
  create(@Body() dto: CreateAudioStemDto) {
    return this.service.createOrGet(dto);
  }

  @Get(':id')
  @RateLimits(
    { limit: 120, windowSeconds: 60, failClosed: true, identity: 'ip' },
    { limit: 120, windowSeconds: 60, failClosed: true, identity: 'user' },
  )
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }
}
