import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { GetLyricsDto } from './dto/get-lyrics.dto';
import { LyricsService } from './lyrics.service';

@Controller('api/lyrics')
export class LyricsController {
  constructor(private readonly lyrics: LyricsService) {}

  @Get()
  async get(@Query() query: GetLyricsDto) {
    const result = await this.lyrics.findLyrics({
      id: query.trackId,
      title: query.title,
      artist: query.artist,
      album: query.album,
      duration: query.duration,
      provider: query.provider,
    });
    if (!result) throw new NotFoundException('Lyrics unavailable');
    return result;
  }
}
