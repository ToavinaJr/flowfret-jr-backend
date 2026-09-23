import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlaylistAccessService } from './playlist-access.service';
import { toPlaylistItemModel } from './playlist.mapper';
import { PlaylistItemModel, PlaylistModel } from './playlist.types';

@Injectable()
export class PlaylistQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlaylistAccessService,
  ) {}

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
