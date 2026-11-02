import {
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { YouTubeAudioService } from './youtube-audio.service';
import { RateLimits } from '../../auth/rate-limit.decorator';

@Controller('api/youtube')
export class YouTubeAudioController {
  private readonly logger = new Logger(YouTubeAudioController.name);

  constructor(private readonly audio: YouTubeAudioService) {}

  @Get(':videoId/audio')
  @RateLimits(
    { limit: 20, windowSeconds: 60, failClosed: true, identity: 'ip' },
    { limit: 80, windowSeconds: 3600, failClosed: true, identity: 'ip' },
    { limit: 30, windowSeconds: 60, failClosed: true, identity: 'user' },
    { limit: 120, windowSeconds: 3600, failClosed: true, identity: 'user' },
  )
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
    const file = new StreamableFile(extraction.stream, {
      type: 'application/octet-stream',
      disposition: `inline; filename="youtube-${videoId}.audio"`,
    });
    file.setErrorHandler((error, res) => {
      if (res.destroyed) return;
      if (res.headersSent) {
        res.end();
        return;
      }
      const status =
        error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.BAD_GATEWAY;
      res.statusCode = status;
      res.send(JSON.stringify({ statusCode: status, message: error.message }));
    });
    return file;
  }
}
