import { Module } from '@nestjs/common';
import { ChordTranscriptionsResolver } from './chord-transcriptions.resolver';
import { ChordTranscriptionsService } from './chord-transcriptions.service';
import { ChordAnalysisConfigService } from './chord-analysis-config.service';
import { ChordAnalysisController } from './chord-analysis.controller';
import { ChordAnalysisService } from './chord-analysis.service';

@Module({
  controllers: [ChordAnalysisController],
  providers: [ChordTranscriptionsResolver, ChordTranscriptionsService, ChordAnalysisConfigService, ChordAnalysisService],
})
export class ChordTranscriptionsModule {}
