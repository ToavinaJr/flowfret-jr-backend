import { Injectable } from '@nestjs/common';
import {
  AddTrackToPlaylistInput,
  CreatePlaylistInput,
  ReorderPlaylistItemsInput,
  UpdatePlaylistInput,
  SetPlaylistCollaboratorInput,
} from './dto/playlist.inputs';
import { PlaylistCommandService } from './playlist-command.service';
import { PlaylistItemsCommandService } from './playlist-items-command.service';
import { PlaylistQueryService } from './playlist-query.service';
import {
  PlaylistItemModel,
  PlaylistCollaboratorModel,
  PlaylistInvitationModel,
  PlaylistModel,
  PublicPlaylistItemModel,
  PublicPlaylistModel,
} from './playlist.types';

/** Stable application facade used by GraphQL and other modules. */
@Injectable()
export class PlaylistsService {
  constructor(
    private readonly queries: PlaylistQueryService,
    private readonly commands: PlaylistCommandService,
    private readonly itemCommands: PlaylistItemsCommandService,
  ) {}

  findPublic(id: string): Promise<PublicPlaylistModel | null> {
    return this.queries.findPublic(id);
  }

  listPublicItems(
    playlistId: string,
    after?: string,
    take = 50,
  ): Promise<PublicPlaylistItemModel[]> {
    return this.queries.listPublicItems(playlistId, after, take);
  }

  list(ownerId: string, after?: string, take = 20): Promise<PlaylistModel[]> {
    return this.queries.list(ownerId, after, take);
  }

  find(id: string, ownerId: string): Promise<PlaylistModel | null> {
    return this.queries.find(id, ownerId);
  }

  listShared(
    ownerId: string,
    after?: string,
    take = 20,
  ): Promise<PlaylistModel[]> {
    return this.queries.listShared(ownerId, after, take);
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

  setCollaborator(
    data: SetPlaylistCollaboratorInput,
    ownerId: string,
  ): Promise<PlaylistCollaboratorModel> {
    return this.commands.setCollaborator(data, ownerId);
  }

  revokeCollaborator(
    playlistId: string,
    userId: string,
    ownerId: string,
  ): Promise<boolean> {
    return this.commands.revokeCollaborator(playlistId, userId, ownerId);
  }

  listCollaborators(
    playlistId: string,
    ownerId: string,
  ): Promise<PlaylistCollaboratorModel[]> {
    return this.commands.listCollaborators(playlistId, ownerId);
  }

  listInvitations(userId: string): Promise<PlaylistInvitationModel[]> {
    return this.commands.listInvitations(userId);
  }

  acceptInvitation(playlistId: string, userId: string): Promise<boolean> {
    return this.commands.acceptInvitation(playlistId, userId);
  }

  declineInvitation(playlistId: string, userId: string): Promise<boolean> {
    return this.commands.declineInvitation(playlistId, userId);
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
