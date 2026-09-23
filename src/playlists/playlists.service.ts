import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MusicProvider, Playlist, Prisma } from '@prisma/client';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddTrackToPlaylistInput,
  CreatePlaylistInput,
  ReorderPlaylistItemsInput,
  TrackSnapshotInput,
  UpdatePlaylistInput,
} from './dto/playlist.inputs';
import { toPlaylistItemModel } from './playlist.mapper';
import { PlaylistItemModel, PlaylistModel } from './playlist.types';

const EXTERNAL_TRACK_HOSTS: Record<MusicProvider, ReadonlySet<string>> = {
  [MusicProvider.AUDIUS]: new Set(['audius.co', 'www.audius.co']),
  [MusicProvider.SPOTIFY]: new Set(['open.spotify.com']),
  [MusicProvider.YOUTUBE]: new Set([
    'youtube.com',
    'www.youtube.com',
    'music.youtube.com',
    'youtu.be',
  ]),
};

@Injectable()
export class PlaylistsService {
  constructor(private readonly prisma: PrismaService) {}

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
    await this.requireOwnedPlaylist(this.prisma, playlistId, ownerId);
    const items = await this.prisma.playlistItem.findMany({
      where: { playlistId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take: Math.min(100, Math.max(1, take)),
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      include: { track: true },
    });
    return items.map(toPlaylistItemModel);
  }

  create(data: CreatePlaylistInput, ownerId: string): Promise<PlaylistModel> {
    const name = this.requiredText(data.name, 'Le nom de la playlist');
    return this.prisma.$transaction(async (tx) => {
      const playlist = await tx.playlist.create({
        data: {
          userId: ownerId,
          name,
          description: this.optionalText(data.description),
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
      await this.requireOwnedPlaylist(tx, id, ownerId);
      const playlist = await tx.playlist.update({
        where: { id },
        data: {
          ...(data.name !== undefined
            ? { name: this.requiredText(data.name, 'Le nom de la playlist') }
            : {}),
          ...(data.description !== undefined
            ? { description: this.optionalText(data.description) }
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
      await this.requireOwnedPlaylist(tx, id, ownerId);
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

  async addTrack(
    input: AddTrackToPlaylistInput,
    ownerId: string,
  ): Promise<PlaylistItemModel> {
    this.assertExternalTrackUrl(input.track);
    try {
      const item = await this.prisma.$transaction(async (tx) => {
        await this.requireOwnedPlaylist(tx, input.playlistId, ownerId);
        const track = await tx.catalogTrack.upsert({
          where: {
            provider_providerTrackId: {
              provider: input.track.provider,
              providerTrackId: input.track.providerTrackId.trim(),
            },
          },
          update: {},
          create: this.catalogTrackCreateData(input.track),
        });
        const allocation = await tx.playlist.update({
          where: { id: input.playlistId },
          data: {
            nextPosition: { increment: 1 },
            version: { increment: 1 },
          },
          select: { nextPosition: true },
        });
        const created = await tx.playlistItem.create({
          data: {
            playlistId: input.playlistId,
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
            metadata: { playlistId: input.playlistId, trackId: track.id },
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
        throw new ConflictException('Ce morceau est déjà dans la playlist.');
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
      await this.requireOwnedPlaylist(tx, playlistId, ownerId);
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
    input: ReorderPlaylistItemsInput,
    ownerId: string,
  ): Promise<PlaylistModel> {
    return this.prisma.$transaction(async (tx) => {
      await this.requireOwnedPlaylist(tx, input.playlistId, ownerId);
      const claimed = await tx.playlist.updateMany({
        where: {
          id: input.playlistId,
          userId: ownerId,
          isDeleted: false,
          version: input.expectedVersion,
        },
        data: { version: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'La playlist a été modifiée. Rechargez-la avant de la réordonner.',
        );
      }
      const existing = await tx.playlistItem.findMany({
        where: { playlistId: input.playlistId },
        select: { id: true },
      });
      const existingIds = new Set(existing.map(({ id }) => id));
      if (
        existingIds.size !== input.orderedItemIds.length ||
        input.orderedItemIds.some((id) => !existingIds.has(id))
      ) {
        throw new BadRequestException(
          'La liste doit contenir exactement tous les morceaux de la playlist.',
        );
      }

      const offset = input.orderedItemIds.length + 1;
      await tx.playlistItem.updateMany({
        where: { playlistId: input.playlistId },
        data: { position: { increment: offset } },
      });
      for (const [position, id] of input.orderedItemIds.entries()) {
        await tx.playlistItem.update({ where: { id }, data: { position } });
      }
      const playlist = await tx.playlist.update({
        where: { id: input.playlistId },
        data: { nextPosition: input.orderedItemIds.length },
      });
      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: AUDIT_ACTION.PLAYLIST_REORDERED,
          entityType: AUDIT_ENTITY.PLAYLIST,
          entityId: input.playlistId,
          metadata: { itemCount: input.orderedItemIds.length },
        },
      });
      return playlist;
    });
  }

  private async requireOwnedPlaylist(
    client: PrismaService | Prisma.TransactionClient,
    id: string,
    ownerId: string,
  ): Promise<Playlist> {
    const playlist = await client.playlist.findFirst({
      where: { id, userId: ownerId, isDeleted: false },
    });
    if (!playlist) throw new NotFoundException('Playlist introuvable.');
    return playlist;
  }

  private catalogTrackCreateData(
    track: TrackSnapshotInput,
  ): Prisma.CatalogTrackCreateInput {
    return {
      provider: track.provider,
      providerTrackId: track.providerTrackId.trim(),
      title: this.requiredText(track.title, 'Le titre'),
      artists: track.artists.map((artist) => ({
        id: this.requiredText(artist.id, "L'identifiant de l'artiste"),
        name: this.requiredText(artist.name, "Le nom de l'artiste"),
      })),
      album: this.optionalText(track.album),
      imageUrl: track.imageUrl ?? null,
      externalUrl: track.externalUrl,
      durationMs: track.durationMs,
      isrc: this.optionalText(track.isrc),
    };
  }

  private assertExternalTrackUrl(track: TrackSnapshotInput): void {
    let parsed: URL;
    try {
      parsed = new URL(track.externalUrl);
    } catch {
      throw new BadRequestException('URL externe du morceau invalide.');
    }
    if (
      parsed.protocol !== 'https:' ||
      !EXTERNAL_TRACK_HOSTS[track.provider].has(parsed.hostname.toLowerCase())
    ) {
      throw new BadRequestException(
        "L'URL externe ne correspond pas au fournisseur du morceau.",
      );
    }
  }

  private requiredText(value: string, label: string): string {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(`${label} est obligatoire.`);
    return normalized;
  }

  private optionalText(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}
