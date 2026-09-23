import { Injectable } from '@nestjs/common';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePlaylistInput,
  UpdatePlaylistInput,
} from './dto/playlist.inputs';
import { PlaylistAccessService } from './playlist-access.service';
import { PlaylistInputService } from './playlist-input.service';
import { PlaylistModel } from './playlist.types';

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
}
