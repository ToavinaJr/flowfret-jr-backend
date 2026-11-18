import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FriendshipStatus,
  PlaylistCollaboratorStatus,
  PlaylistVisibility,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlaylistAccessService } from './playlist-access.service';
import { toCatalogTrackModel, toPlaylistItemModel } from './playlist.mapper';
import {
  PlaylistItemModel,
  PlaylistModel,
  PublicPlaylistItemModel,
  PublicPlaylistModel,
} from './playlist.types';

@Injectable()
export class PlaylistQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlaylistAccessService,
  ) {}

  async findPublic(id: string): Promise<PublicPlaylistModel | null> {
    return this.prisma.playlist.findFirst({
      where: { id, visibility: PlaylistVisibility.PUBLIC, isDeleted: false },
      select: { id: true, name: true, description: true, coverUrl: true },
    });
  }

  async listPublicItems(
    playlistId: string,
    after?: string,
    take = 50,
  ): Promise<PublicPlaylistItemModel[]> {
    const playlist = await this.prisma.playlist.findFirst({
      where: {
        id: playlistId,
        visibility: PlaylistVisibility.PUBLIC,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!playlist) throw new NotFoundException('Playlist introuvable.');

    const items = await this.prisma.playlistItem.findMany({
      where: { playlistId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take: Math.min(100, Math.max(1, take)),
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      include: { track: true },
    });
    return items.map((item) => ({
      id: item.id,
      position: item.position,
      track: toCatalogTrackModel(item.track),
    }));
  }

  list(ownerId: string, after?: string, take = 20): Promise<PlaylistModel[]> {
    return this.prisma.playlist.findMany({
      where: { userId: ownerId, isDeleted: false },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: Math.min(50, Math.max(1, take)),
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    });
  }

  async find(id: string, actorId: string): Promise<PlaylistModel | null> {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id, isDeleted: false },
    });
    if (!playlist) return null;
    try {
      await this.access.requireCanRead(this.prisma, id, actorId);
      return playlist;
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  async listShared(
    actorId: string,
    after?: string,
    take = 20,
  ): Promise<PlaylistModel[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: FriendshipStatus.ACCEPTED,
        isDeleted: false,
        OR: [
          {
            requesterId: actorId,
            receiver: { isDeleted: false, status: UserStatus.ACTIVE },
          },
          {
            receiverId: actorId,
            requester: { isDeleted: false, status: UserStatus.ACTIVE },
          },
        ],
      },
      select: { requesterId: true, receiverId: true },
    });
    const friendIds = friendships.map(({ requesterId, receiverId }) =>
      requesterId === actorId ? receiverId : requesterId,
    );
    if (friendIds.length === 0) return [];
    return this.prisma.playlist.findMany({
      where: {
        userId: { in: friendIds },
        isDeleted: false,
        collaborators: {
          some: { userId: actorId, status: PlaylistCollaboratorStatus.ACCEPTED },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: Math.min(50, Math.max(1, take)),
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    });
  }

  async listItems(
    playlistId: string,
    ownerId: string,
    after?: string,
    take = 50,
  ): Promise<PlaylistItemModel[]> {
    await this.access.requireCanRead(this.prisma, playlistId, ownerId);
    const items = await this.prisma.playlistItem.findMany({
      where: { playlistId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take: Math.min(100, Math.max(1, take)),
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      include: { track: true },
    });
    return items.map(toPlaylistItemModel);
  }
}
