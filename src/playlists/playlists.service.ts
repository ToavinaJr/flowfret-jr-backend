import { Injectable } from '@nestjs/common';
import {
  AddTrackToPlaylistInput,
  CreatePlaylistInput,
  ReorderPlaylistItemsInput,
  UpdatePlaylistInput,
} from './dto/playlist.inputs';
import { PlaylistCommandService } from './playlist-command.service';
import { PlaylistItemsCommandService } from './playlist-items-command.service';
import { PlaylistQueryService } from './playlist-query.service';
import { PlaylistItemModel, PlaylistModel } from './playlist.types';

/** Stable application facade used by GraphQL and other modules. */
@Injectable()
export class PlaylistsService {
  constructor(
    private readonly queries: PlaylistQueryService,
    private readonly commands: PlaylistCommandService,
    private readonly itemCommands: PlaylistItemsCommandService,
  ) {}

  list(ownerId: string, after?: string, take = 20): Promise<PlaylistModel[]> {
    return this.queries.list(ownerId, after, take);
  }

  find(id: string, ownerId: string): Promise<PlaylistModel | null> {
    return this.queries.find(id, ownerId);
  }

  listItems(
    playlistId: string,
    ownerId: string,
    after?: string,
    take = 50,
  ): Promise<PlaylistItemModel[]> {
    return this.queries.listItems(playlistId, ownerId, after, take);
  }

  create(data: CreatePlaylistInput, ownerId: string): Promise<PlaylistModel> {
    return this.commands.create(data, ownerId);
  }

  update(
    id: string,
    data: UpdatePlaylistInput,
    ownerId: string,
  ): Promise<PlaylistModel> {
    return this.commands.update(id, data, ownerId);
  }

  delete(id: string, ownerId: string): Promise<boolean> {
    return this.commands.delete(id, ownerId);
  }

  addTrack(
    data: AddTrackToPlaylistInput,
    ownerId: string,
  ): Promise<PlaylistItemModel> {
    return this.itemCommands.addTrack(data, ownerId);
  }

  removeTrack(
    playlistId: string,
    itemId: string,
    ownerId: string,
  ): Promise<boolean> {
    return this.itemCommands.removeTrack(playlistId, itemId, ownerId);
  }

  reorder(
    data: ReorderPlaylistItemsInput,
    ownerId: string,
  ): Promise<PlaylistModel> {
    return this.itemCommands.reorder(data, ownerId);
  }
}
