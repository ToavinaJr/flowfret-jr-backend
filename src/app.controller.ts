import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('api/features')
  getRuntimeFeatures(): { chordTranscription: boolean } {
    return {
      chordTranscription:
        this.config
          .get<string>('CHORD_TRANSCRIPTION')
          ?.trim()
          .toLowerCase() === 'true',
    };
  }

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
