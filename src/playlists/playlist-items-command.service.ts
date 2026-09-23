import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddTrackToPlaylistInput,
  ReorderPlaylistItemsInput,
} from './dto/playlist.inputs';
import { PlaylistAccessService } from './playlist-access.service';
import { PlaylistInputService } from './playlist-input.service';
import { toPlaylistItemModel } from './playlist.mapper';
import { PlaylistItemModel, PlaylistModel } from './playlist.types';

@Injectable()
export class PlaylistItemsCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlaylistAccessService,
    private readonly input: PlaylistInputService,
  ) {}

  async addTrack(
    data: AddTrackToPlaylistInput,
    ownerId: string,
  ): Promise<PlaylistItemModel> {
    this.input.assertExternalTrackUrl(data.track);
    try {
      const item = await this.prisma.$transaction(async (tx) => {
        await this.access.requireOwned(tx, data.playlistId, ownerId);
        const track = await tx.catalogTrack.upsert({
          where: {
            provider_providerTrackId: {
              provider: data.track.provider,
              providerTrackId: data.track.providerTrackId.trim(),
            },
          },
          update: {},
          create: this.input.catalogTrackCreateData(data.track),
        });
        const allocation = await tx.playlist.update({
          where: { id: data.playlistId },
          data: {
            nextPosition: { increment: 1 },
            version: { increment: 1 },
          },
          select: { nextPosition: true },
        });
        const created = await tx.playlistItem.create({
          data: {
            playlistId: data.playlistId,
            trackId: track.id,
            addedById: ownerId,
            position: allocation.nextPosition - 1,
          },
          include: { track: true },
        });
        await tx.auditLog.create({
          data: {
            actorId: ownerId,
            action: AUDIT_ACTION.PLAYLIST_TRACK_ADDED,
            entityType: AUDIT_ENTITY.PLAYLIST_ITEM,
            entityId: created.id,
            metadata: { playlistId: data.playlistId, trackId: track.id },
          },
        });
        return created;
      });
      return toPlaylistItemModel(item);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ce morceau est dÃ©jÃ  dans la playlist.');
      }
      throw error;
    }
  }

  removeTrack(
    playlistId: string,
    itemId: string,
    ownerId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await this.access.requireOwned(tx, playlistId, ownerId);
      const item = await tx.playlistItem.findFirst({
        where: { id: itemId, playlistId },
      });
      if (!item)
        throw new NotFoundException('Morceau de playlist introuvable.');
      await tx.playlistItem.delete({ where: { id: itemId } });
      await tx.playlist.update({
        where: { id: playlistId },
        data: { version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: AUDIT_ACTION.PLAYLIST_TRACK_REMOVED,
          entityType: AUDIT_ENTITY.PLAYLIST_ITEM,
          entityId: itemId,
          metadata: { playlistId, trackId: item.trackId },
        },
      });
      return true;
    });
  }

  reorder(
    data: ReorderPlaylistItemsInput,
    ownerId: string,
  ): Promise<PlaylistModel> {
    return this.prisma.$transaction(async (tx) => {
      await this.access.requireOwned(tx, data.playlistId, ownerId);
      const claimed = await tx.playlist.updateMany({
        where: {
          id: data.playlistId,
          userId: ownerId,
          isDeleted: false,
          version: data.expectedVersion,
        },
        data: { version: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'La playlist a Ã©tÃ© modifiÃ©e. Rechargez-la avant de la rÃ©ordonner.',
        );
      }
      const existing = await tx.playlistItem.findMany({
        where: { playlistId: data.playlistId },
        select: { id: true },
      });
      const existingIds = new Set(existing.map(({ id }) => id));
      if (
        existingIds.size !== data.orderedItemIds.length ||
        data.orderedItemIds.some((id) => !existingIds.has(id))
      ) {
        throw new BadRequestException(
          'La liste doit contenir exactement tous les morceaux de la playlist.',
        );
      }

      const offset = data.orderedItemIds.length + 1;
      await tx.playlistItem.updateMany({
        where: { playlistId: data.playlistId },
        data: { position: { increment: offset } },
      });
      for (const [position, id] of data.orderedItemIds.entries()) {
        await tx.playlistItem.update({ where: { id }, data: { position } });
      }
      const playlist = await tx.playlist.update({
        where: { id: data.playlistId },
        data: { nextPosition: data.orderedItemIds.length },
      });
      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: AUDIT_ACTION.PLAYLIST_REORDERED,
          entityType: AUDIT_ENTITY.PLAYLIST,
          entityId: data.playlistId,
          metadata: { itemCount: data.orderedItemIds.length },
        },
      });
      return playlist;
    });
  }
}
