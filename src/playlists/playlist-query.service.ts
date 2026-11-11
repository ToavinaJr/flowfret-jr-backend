import { Injectable, NotFoundException } from '@nestjs/common';
import { PlaylistVisibility } from '@prisma/client';
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

  find(id: string, ownerId: string): Promise<PlaylistModel | null> {
    return this.prisma.playlist.findFirst({
      where: { id, userId: ownerId, isDeleted: false },
    });
  }

  async listItems(
    playlistId: string,
    ownerId: string,
    after?: string,
    take = 50,
  ): Promise<PlaylistItemModel[]> {
    await this.access.requireOwned(this.prisma, playlistId, ownerId);
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
