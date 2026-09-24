import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { MusicProvider } from '@prisma/client';
import { RateLimits } from '../auth/rate-limit.decorator';
import {
  ChordTranscriptionModel,
  SaveChordTranscriptionInput,
} from './chord-transcription.types';
import { ChordTranscriptionsService } from './chord-transcriptions.service';

@Resolver(() => ChordTranscriptionModel)
export class ChordTranscriptionsResolver {
  constructor(private readonly service: ChordTranscriptionsService) {}

  @Query(() => ChordTranscriptionModel, {
    name: 'chordTranscription',
    nullable: true,
  })
  chordTranscription(
    @Args('provider', { type: () => MusicProvider }) provider: MusicProvider,
    @Args('providerTrackId') providerTrackId: string,
  ): Promise<ChordTranscriptionModel | null> {
    return this.service.find(provider, providerTrackId);
  }

  @Mutation(() => ChordTranscriptionModel, { name: 'saveChordTranscription' })
  @RateLimits(
    { limit: 10, windowSeconds: 60, failClosed: true },
    { limit: 100, windowSeconds: 86_400, failClosed: true },
  )
  saveChordTranscription(
    @Args('data') data: SaveChordTranscriptionInput,
  ): Promise<ChordTranscriptionModel> {
    return this.service.saveIfAbsent(data);
  }
}
