import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FriendshipStatus,
  PlaylistCollaboratorStatus,
  UserStatus,
} from '@prisma/client';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePlaylistInput,
  UpdatePlaylistInput,
  SetPlaylistCollaboratorInput,
} from './dto/playlist.inputs';
import { PlaylistAccessService } from './playlist-access.service';
import { PlaylistInputService } from './playlist-input.service';
import {
  PlaylistCollaboratorModel,
  PlaylistInvitationModel,
  PlaylistModel,
} from './playlist.types';

@Injectable()
export class PlaylistCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlaylistAccessService,
    private readonly input: PlaylistInputService,
  ) {}

  create(data: CreatePlaylistInput, ownerId: string): Promise<PlaylistModel> {
    const name = this.input.requiredText(data.name, 'Le nom de la playlist');
    return this.prisma.$transaction(async (tx) => {
      const playlist = await tx.playlist.create({
        data: {
          userId: ownerId,
          name,
          description: this.input.optionalText(data.description),
          coverUrl: data.coverUrl ?? null,
          visibility: data.visibility,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: AUDIT_ACTION.PLAYLIST_CREATED,
          entityType: AUDIT_ENTITY.PLAYLIST,
          entityId: playlist.id,
          metadata: {},
        },
      });
      return playlist;
    });
  }

  update(
    id: string,
    data: UpdatePlaylistInput,
    ownerId: string,
  ): Promise<PlaylistModel> {
    return this.prisma.$transaction(async (tx) => {
      await this.access.requireOwned(tx, id, ownerId);
      const playlist = await tx.playlist.update({
        where: { id },
        data: {
          ...(data.name !== undefined
            ? {
                name: this.input.requiredText(
                  data.name,
                  'Le nom de la playlist',
                ),
              }
            : {}),
          ...(data.description !== undefined
            ? { description: this.input.optionalText(data.description) }
            : {}),
          ...(data.coverUrl !== undefined
            ? { coverUrl: data.coverUrl ?? null }
            : {}),
          ...(data.visibility !== undefined
            ? { visibility: data.visibility }
            : {}),
          version: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: AUDIT_ACTION.PLAYLIST_UPDATED,
          entityType: AUDIT_ENTITY.PLAYLIST,
          entityId: id,
          metadata: {},
        },
      });
      return playlist;
    });
  }

  delete(id: string, ownerId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await this.access.requireOwned(tx, id, ownerId);
      await tx.playlist.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: AUDIT_ACTION.PLAYLIST_DELETED,
          entityType: AUDIT_ENTITY.PLAYLIST,
          entityId: id,
          metadata: {},
        },
      });
      return true;
    });
  }

  setCollaborator(
    data: SetPlaylistCollaboratorInput,
    ownerId: string,
  ): Promise<PlaylistCollaboratorModel> {
    return this.prisma.$transaction(async (tx) => {
      await this.access.requireOwned(tx, data.playlistId, ownerId);
      if (data.userId === ownerId) {
        throw new NotFoundException('Collaborateur introuvable.');
      }
      const friendship = await tx.friendship.findFirst({
        where: {
          status: FriendshipStatus.ACCEPTED,
          isDeleted: false,
          OR: [
            { requesterId: ownerId, receiverId: data.userId },
            { requesterId: data.userId, receiverId: ownerId },
          ],
          requester: { isDeleted: false, status: UserStatus.ACTIVE },
          receiver: { isDeleted: false, status: UserStatus.ACTIVE },
        },
        select: { id: true },
      });
      if (!friendship)
        throw new NotFoundException('Collaborateur introuvable.');
      const collaborator = await tx.playlistCollaborator.upsert({
        where: {
          playlistId_userId: {
            playlistId: data.playlistId,
            userId: data.userId,
          },
        },
        create: {
          playlistId: data.playlistId,
          userId: data.userId,
          grantedById: ownerId,
          role: data.role,
          status: PlaylistCollaboratorStatus.PENDING,
          acceptedAt: null,
        },
        update: {
          role: data.role,
          grantedById: ownerId,
          status: PlaylistCollaboratorStatus.PENDING,
          acceptedAt: null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: AUDIT_ACTION.PLAYLIST_COLLABORATOR_GRANTED,
          entityType: AUDIT_ENTITY.PLAYLIST,
          entityId: data.playlistId,
          metadata: { userId: data.userId, role: data.role },
        },
      });
      return collaborator;
    });
  }

  revokeCollaborator(
    playlistId: string,
    userId: string,
    ownerId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await this.access.requireOwned(tx, playlistId, ownerId);
      const removed = await tx.playlistCollaborator.deleteMany({
        where: { playlistId, userId },
      });
      if (!removed.count)
        throw new NotFoundException('Collaborateur introuvable.');
      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: AUDIT_ACTION.PLAYLIST_COLLABORATOR_REVOKED,
          entityType: AUDIT_ENTITY.PLAYLIST,
          entityId: playlistId,
          metadata: { userId },
        },
      });
      return true;
    });
  }

  async listCollaborators(
    playlistId: string,
    ownerId: string,
  ): Promise<PlaylistCollaboratorModel[]> {
    await this.access.requireOwned(this.prisma, playlistId, ownerId);
    return this.prisma.playlistCollaborator.findMany({
      where: { playlistId },
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
    });
  }

  listInvitations(userId: string): Promise<PlaylistInvitationModel[]> {
    return this.prisma.playlistCollaborator.findMany({
      where: {
        userId,
        status: PlaylistCollaboratorStatus.PENDING,
        playlist: { isDeleted: false },
      },
      include: {
        playlist: {
          select: { name: true, user: { select: { username: true } } },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { playlistId: 'asc' }],
    }).then((rows) => rows.map((row) => ({
      playlistId: row.playlistId,
      userId: row.userId,
      role: row.role,
      status: row.status,
      createdAt: row.createdAt,
      playlistName: row.playlist.name,
      ownerUsername: row.playlist.user.username,
    })));
  }

  async acceptInvitation(playlistId: string, userId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.playlistCollaborator.findFirst({
        where: {
          playlistId,
          userId,
          status: PlaylistCollaboratorStatus.PENDING,
          playlist: { isDeleted: false },
        },
        select: { playlist: { select: { userId: true } } },
      });
      if (!invitation) throw new NotFoundException('Invitation introuvable.');
      const friendship = await tx.friendship.findFirst({
        where: {
          status: FriendshipStatus.ACCEPTED,
          isDeleted: false,
          OR: [
            { requesterId: invitation.playlist.userId, receiverId: userId },
            { requesterId: userId, receiverId: invitation.playlist.userId },
          ],
        },
        select: { id: true },
      });
      if (!friendship) throw new NotFoundException('Invitation introuvable.');
      const updated = await tx.playlistCollaborator.updateMany({
        where: {
          playlistId,
          userId,
          status: PlaylistCollaboratorStatus.PENDING,
        },
        data: {
          status: PlaylistCollaboratorStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });
      return updated.count === 1;
    });
  }

  async declineInvitation(playlistId: string, userId: string): Promise<boolean> {
    const deleted = await this.prisma.playlistCollaborator.deleteMany({
      where: {
        playlistId,
        userId,
        status: PlaylistCollaboratorStatus.PENDING,
      },
    });
    if (!deleted.count) throw new NotFoundException('Invitation introuvable.');
    return true;
  }
}
