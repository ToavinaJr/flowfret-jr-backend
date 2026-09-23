import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { RateLimits } from '../auth/rate-limit.decorator';
import {
  AddTrackToPlaylistInput,
  CreatePlaylistInput,
  ReorderPlaylistItemsInput,
  UpdatePlaylistInput,
} from './dto/playlist.inputs';
import { PlaylistItemModel, PlaylistModel } from './playlist.types';
import { PlaylistsService } from './playlists.service';

type RequestContext = { req: { user: { sub: string } } };

@Resolver(() => PlaylistModel)
export class PlaylistsResolver {
  constructor(private readonly playlists: PlaylistsService) {}

  @Query(() => [PlaylistModel], { name: 'myPlaylists' })
  myPlaylists(
    @Context() context: RequestContext,
    @Args('take', { type: () => Int, defaultValue: 20 }) take: number,
    @Args('after', { type: () => String, nullable: true }) after?: string,
  ): Promise<PlaylistModel[]> {
    return this.playlists.list(context.req.user.sub, after, take);
  }

  @Query(() => PlaylistModel, { name: 'playlist', nullable: true })
  playlist(
    @Args('id') id: string,
    @Context() context: RequestContext,
  ): Promise<PlaylistModel | null> {
    return this.playlists.find(id, context.req.user.sub);
  }

  @Query(() => [PlaylistItemModel], { name: 'playlistItems' })
  playlistItems(
    @Args('playlistId') playlistId: string,
    @Context() context: RequestContext,
    @Args('take', { type: () => Int, defaultValue: 50 }) take: number,
    @Args('after', { type: () => String, nullable: true }) after?: string,
  ): Promise<PlaylistItemModel[]> {
    return this.playlists.listItems(
      playlistId,
      context.req.user.sub,
      after,
      take,
    );
  }

  @Mutation(() => PlaylistModel)
  @RateLimits({ limit: 30, windowSeconds: 60, failClosed: true })
  createPlaylist(
    @Args('data') data: CreatePlaylistInput,
    @Context() context: RequestContext,
  ): Promise<PlaylistModel> {
    return this.playlists.create(data, context.req.user.sub);
  }

  @Mutation(() => PlaylistModel)
  @RateLimits({ limit: 60, windowSeconds: 60, failClosed: true })
  updatePlaylist(
    @Args('id') id: string,
    @Args('data') data: UpdatePlaylistInput,
    @Context() context: RequestContext,
  ): Promise<PlaylistModel> {
    return this.playlists.update(id, data, context.req.user.sub);
  }

  @Mutation(() => Boolean)
  @RateLimits({ limit: 30, windowSeconds: 60, failClosed: true })
  deletePlaylist(
    @Args('id') id: string,
    @Context() context: RequestContext,
  ): Promise<boolean> {
    return this.playlists.delete(id, context.req.user.sub);
  }

  @Mutation(() => PlaylistItemModel)
  @RateLimits({ limit: 120, windowSeconds: 60, failClosed: true })
  addTrackToPlaylist(
    @Args('data') data: AddTrackToPlaylistInput,
    @Context() context: RequestContext,
  ): Promise<PlaylistItemModel> {
    return this.playlists.addTrack(data, context.req.user.sub);
  }

  @Mutation(() => Boolean)
  @RateLimits({ limit: 120, windowSeconds: 60, failClosed: true })
  removeTrackFromPlaylist(
    @Args('playlistId') playlistId: string,
    @Args('itemId') itemId: string,
    @Context() context: RequestContext,
  ): Promise<boolean> {
    return this.playlists.removeTrack(playlistId, itemId, context.req.user.sub);
  }

  @Mutation(() => PlaylistModel)
  @RateLimits({ limit: 60, windowSeconds: 60, failClosed: true })
  reorderPlaylistItems(
    @Args('data') data: ReorderPlaylistItemsInput,
    @Context() context: RequestContext,
  ): Promise<PlaylistModel> {
    return this.playlists.reorder(data, context.req.user.sub);
  }
}
