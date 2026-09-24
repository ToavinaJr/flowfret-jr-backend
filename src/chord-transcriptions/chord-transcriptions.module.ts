import { Module } from '@nestjs/common';
import { ChordTranscriptionsResolver } from './chord-transcriptions.resolver';
import { ChordTranscriptionsService } from './chord-transcriptions.service';

@Module({
  providers: [ChordTranscriptionsResolver, ChordTranscriptionsService],
})
export class ChordTranscriptionsModule {}
