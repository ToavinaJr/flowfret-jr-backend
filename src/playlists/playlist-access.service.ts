import { Injectable, NotFoundException } from '@nestjs/common';
import { Playlist, Prisma } from '@prisma/client';
import { playlistPolicy } from '../policies/playlist.policy';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlaylistAccessService {
  async requireOwned(
    client: PrismaService | Prisma.TransactionClient,
    id: string,
    ownerId: string,
  ): Promise<Playlist> {
    const playlist = await client.playlist.findFirst({
      where: { id, userId: ownerId, isDeleted: false },
    });
    if (!playlist) throw new NotFoundException('Playlist introuvable.');
    playlistPolicy.assertCanManage(ownerId, playlist);
    return playlist;
  }
}
