import {
  Controller,
  Get,
  Header,
  Logger,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { YouTubeAudioService } from './youtube-audio.service';

@Controller('api/youtube')
export class YouTubeAudioController {
  private readonly logger = new Logger(YouTubeAudioController.name);

  constructor(private readonly audio: YouTubeAudioService) {}

  @Get(':videoId/audio')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  stream(
    @Param('videoId') videoId: string,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    const diagnosticId = randomUUID();
    response.setHeader('X-Chord-Diagnostic-Id', diagnosticId);
    this.logger.log(
      JSON.stringify({
        event: 'youtube.audio_request',
        diagnosticId,
        videoId,
      }),
    );
    const extraction = this.audio.createStream(videoId, diagnosticId);
    response.once('close', extraction.dispose);
    return new StreamableFile(extraction.stream, {
      type: 'application/octet-stream',
      disposition: `inline; filename="youtube-${videoId}.audio"`,
    });
  }
}
