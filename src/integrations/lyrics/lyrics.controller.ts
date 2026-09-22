import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { GetLyricsDto } from './dto/get-lyrics.dto';
import { LyricsService } from './lyrics.service';
import { Public } from '../../auth/public.decorator';
import { RateLimits } from '../../auth/rate-limit.decorator';

@Controller('api/lyrics')
@Public()
export class LyricsController {
  constructor(private readonly lyrics: LyricsService) {}

  @Get()
  @RateLimits(
    { limit: 30, windowSeconds: 60, failClosed: true },
    { limit: 500, windowSeconds: 86_400, failClosed: true },
  )
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
