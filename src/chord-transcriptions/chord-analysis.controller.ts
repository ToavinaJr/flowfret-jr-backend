import { BadRequestException, Controller, Get, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RateLimits } from '../auth/rate-limit.decorator';
import { ChordAnalysisConfigService } from './chord-analysis-config.service';
import { ChordAnalysisService, MAX_CHORD_AUDIO_BYTES } from './chord-analysis.service';

@Controller('api/chords')
export class ChordAnalysisController {
  constructor(private readonly analysis: ChordAnalysisService, private readonly config: ChordAnalysisConfigService) {}

  @Get('capabilities')
  capabilities() { return { neuralAnalysis: this.config.enabled }; }

  @Post('analyze')
  @RateLimits({ limit: 4, windowSeconds: 60, failClosed: true }, { limit: 20, windowSeconds: 3600, failClosed: true })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_CHORD_AUDIO_BYTES, files: 1, fields: 0 } }))
  analyze(@UploadedFile() file?: Express.Multer.File) {
    if (!file || !file.buffer.length || !(/^(audio\/|application\/ogg$)/i.test(file.mimetype) || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.originalname))) {
      throw new BadRequestException('An audio file is required');
    }
    // The worker decodes and validates the media; the claimed MIME type is not trusted.
    return this.analysis.analyze(file.buffer);
  }
}
