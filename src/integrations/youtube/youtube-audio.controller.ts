import {
  Controller,
  Get,
  Header,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { RateLimits } from '../../auth/rate-limit.decorator';
import { YouTubeAudioService } from './youtube-audio.service';

@Controller('api/youtube')
export class YouTubeAudioController {
  constructor(private readonly audio: YouTubeAudioService) {}

  @Get(':videoId/audio')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @RateLimits(
    { limit: 3, windowSeconds: 60, failClosed: true },
    { limit: 20, windowSeconds: 86_400, failClosed: true },
  )
  stream(
    @Param('videoId') videoId: string,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    const extraction = this.audio.createStream(videoId);
    response.once('close', extraction.dispose);
    return new StreamableFile(extraction.stream, {
      type: 'application/octet-stream',
      disposition: `inline; filename="youtube-${videoId}.audio"`,
    });
  }
}
