import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { SearchMusicArgs } from './dto/search-music.args';
import { MusicService } from './music.service';
import { ListeningStats, MusicSearchResult } from './music.types';
import { RateLimits } from '../../auth/rate-limit.decorator';
import { ListeningHistoryService } from './listening-history.service';
import { RecordTrackListenInput } from './listening-history.types';
import { MusicTrack } from './music.types';
import { MusicRecommendationsService } from './music-recommendations.service';

@Resolver()
export class MusicResolver {
  constructor(
    private readonly musicService: MusicService,
    private readonly listeningHistory: ListeningHistoryService,
    private readonly recommendations: MusicRecommendationsService,
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

  @Query(() => [MusicTrack], { name: 'myMusicRecommendations' })
  @RateLimits(
    { limit: 10, windowSeconds: 60, failClosed: true },
    { limit: 100, windowSeconds: 86_400, failClosed: true },
  )
  myMusicRecommendations(
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<MusicTrack[]> {
    return this.recommendations.forUser(context.req.user.sub);
  }

  @Query(() => [MusicTrack], { name: 'myListeningHistory' })
  myListeningHistory(
    @Context() context: { req: { user: { sub: string } } },
    @Args('take', { type: () => Int, defaultValue: 20 }) take: number,
    @Args('skip', { type: () => Int, defaultValue: 0 }) skip: number,
  ): Promise<MusicTrack[]> {
    return this.listeningHistory.list(context.req.user.sub, take, skip);
  }

  @Query(() => ListeningStats, { name: 'myListeningStats' })
  myListeningStats(
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<ListeningStats> {
    return this.listeningHistory.statistics(context.req.user.sub);
  }

  @Query(() => [MusicTrack], { name: 'myFavoriteMusic' })
  myFavoriteMusic(
    @Context() context: { req: { user: { sub: string } } },
    @Args('take', { type: () => Int, defaultValue: 50 }) take: number,
    @Args('skip', { type: () => Int, defaultValue: 0 }) skip: number,
  ): Promise<MusicTrack[]> {
    return this.listeningHistory.listFavorites(
      context.req.user.sub,
      take,
      skip,
    );
  }

  @Mutation(() => Boolean, { name: 'setTrackFavorite' })
  @RateLimits(
    { limit: 60, windowSeconds: 60, failClosed: true },
    { limit: 1000, windowSeconds: 86_400, failClosed: true },
  )
  setTrackFavorite(
    @Args('track') track: RecordTrackListenInput,
    @Args('favorite') favorite: boolean,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<boolean> {
    return this.listeningHistory.setFavorite(
      context.req.user.sub,
      track,
      favorite,
    );
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
