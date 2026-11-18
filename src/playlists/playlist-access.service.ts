import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FriendshipStatus,
  Playlist,
  PlaylistCollaboratorRole,
  PlaylistCollaboratorStatus,
  Prisma,
} from '@prisma/client';
import { playlistPolicy } from '../policies/playlist.policy';
import { PolicyViolationError } from '../policies/policy-violation.error';
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

  async requireCanRead(
    client: PrismaService | Prisma.TransactionClient,
    id: string,
    actorId: string,
  ): Promise<Playlist> {
    const playlist = await client.playlist.findFirst({
      where: { id, isDeleted: false },
    });
    if (!playlist) throw new NotFoundException('Playlist introuvable.');
    if (playlist.userId === actorId) return playlist;

    const collaborator = await client.playlistCollaborator.findUnique({
      where: { playlistId_userId: { playlistId: id, userId: actorId } },
      select: { role: true, status: true },
    });
    if (collaborator?.status !== PlaylistCollaboratorStatus.ACCEPTED) {
      throw new NotFoundException('Playlist introuvable.');
    }
    await this.requireActiveFriendship(client, playlist.userId, actorId);
    return playlist;
  }

  async requireCanEdit(
    client: PrismaService | Prisma.TransactionClient,
    id: string,
    actorId: string,
  ): Promise<Playlist> {
    const playlist = await this.requireCanRead(client, id, actorId);
    if (playlist.userId === actorId) return playlist;

    const collaborator = await client.playlistCollaborator.findUnique({
      where: { playlistId_userId: { playlistId: id, userId: actorId } },
      select: { role: true, status: true },
    });
    if (
      collaborator?.status !== PlaylistCollaboratorStatus.ACCEPTED ||
      collaborator.role !== PlaylistCollaboratorRole.EDITOR
    ) {
      throw new PolicyViolationError('PLAYLIST_FORBIDDEN');
    }
    return playlist;
  }

  private async requireActiveFriendship(
    client: PrismaService | Prisma.TransactionClient,
    ownerId: string,
    actorId: string,
  ): Promise<void> {
    const friendship = await client.friendship.findFirst({
      where: {
        status: FriendshipStatus.ACCEPTED,
        isDeleted: false,
        OR: [
          { requesterId: ownerId, receiverId: actorId },
          { requesterId: actorId, receiverId: ownerId },
        ],
      },
      select: { id: true },
    });
    if (!friendship) throw new NotFoundException('Playlist introuvable.');
  }
}
