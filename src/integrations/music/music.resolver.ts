import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { SearchMusicArgs } from './dto/search-music.args';
import { MusicService } from './music.service';
import { MusicSearchResult } from './music.types';
import { RateLimits } from '../../auth/rate-limit.decorator';
import { ListeningHistoryService } from './listening-history.service';
import { RecordTrackListenInput } from './listening-history.types';
import { MusicTrack } from './music.types';

@Resolver()
export class MusicResolver {
  constructor(
    private readonly musicService: MusicService,
    private readonly listeningHistory: ListeningHistoryService,
  ) {}

  @Query(() => MusicSearchResult, { name: 'searchMusic' })
  @RateLimits(
    { limit: 20, windowSeconds: 60, failClosed: true },
    { limit: 300, windowSeconds: 86_400, failClosed: true },
  )
  searchMusic(@Args() args: SearchMusicArgs): Promise<MusicSearchResult> {
    return this.musicService.searchMusic(args.query, args.limit, args.cursor);
  }

  @Query(() => [MusicTrack], { name: 'trendingMusic' })
  @RateLimits(
    { limit: 30, windowSeconds: 60, failClosed: true },
    { limit: 500, windowSeconds: 86_400, failClosed: true },
  )
  trendingMusic(): Promise<MusicTrack[]> {
    return this.listeningHistory.trending(10);
  }

  @Query(() => [MusicTrack], { name: 'myListeningHistory' })
  myListeningHistory(
    @Context() context: { req: { user: { sub: string } } },
    @Args('take', { type: () => Int, defaultValue: 20 }) take: number,
  ): Promise<MusicTrack[]> {
    return this.listeningHistory.list(context.req.user.sub, take);
  }

  @Mutation(() => Boolean, { name: 'recordTrackListen' })
  @RateLimits(
    { limit: 60, windowSeconds: 60, failClosed: true },
    { limit: 1000, windowSeconds: 86_400, failClosed: true },
  )
  recordTrackListen(
    @Args('track') track: RecordTrackListenInput,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<boolean> {
    return this.listeningHistory.record(context.req.user.sub, track);
  }
}
