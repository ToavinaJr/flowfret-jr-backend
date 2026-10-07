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

@Controller('api/audio-stems')
@UseGuards(AuthGuard('jwt'))
export class StemsController {
  constructor(private readonly service: StemsService) {}

  @Post()
  create(@Body() dto: CreateAudioStemDto) {
    return this.service.createOrGet(dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }
}
