import { Args, Query, Resolver } from '@nestjs/graphql';
import { SearchMusicArgs } from './dto/search-music.args';
import { MusicService } from './music.service';
import { MusicSearchResult } from './music.types';

@Resolver()
export class MusicResolver {
  constructor(private readonly musicService: MusicService) {}

  @Query(() => MusicSearchResult, { name: 'searchMusic' })
  searchMusic(@Args() args: SearchMusicArgs): Promise<MusicSearchResult> {
    return this.musicService.searchMusic(args.query, args.limit);
  }
}
