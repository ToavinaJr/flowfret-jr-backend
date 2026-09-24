import { Args, Query, Resolver } from '@nestjs/graphql';
import { SearchMusicArgs } from './dto/search-music.args';
import { MusicService } from './music.service';
import { MusicSearchResult } from './music.types';
import { RateLimits } from '../../auth/rate-limit.decorator';

@Resolver()
export class MusicResolver {
  constructor(private readonly musicService: MusicService) {}

  @Query(() => MusicSearchResult, { name: 'searchMusic' })
  @RateLimits(
    { limit: 20, windowSeconds: 60, failClosed: true },
    { limit: 300, windowSeconds: 86_400, failClosed: true },
  )
  searchMusic(@Args() args: SearchMusicArgs): Promise<MusicSearchResult> {
    return this.musicService.searchMusic(args.query, args.limit, args.cursor);
  }
}
