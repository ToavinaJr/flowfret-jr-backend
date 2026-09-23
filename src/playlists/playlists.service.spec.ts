import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MusicProvider, PlaylistVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlaylistAccessService } from './playlist-access.service';
import { PlaylistCommandService } from './playlist-command.service';
import { PlaylistInputService } from './playlist-input.service';
import { PlaylistItemsCommandService } from './playlist-items-command.service';
import { PlaylistQueryService } from './playlist-query.service';
import { PlaylistsService } from './playlists.service';

const ownerId = '00000000-0000-4000-8000-000000000001';
const playlistId = '00000000-0000-4000-8000-000000000002';
const itemId = '00000000-0000-4000-8000-000000000003';
const now = new Date('2026-09-23T12:00:00.000Z');

const playlist = {
  id: playlistId,
  userId: ownerId,
  name: 'Favoris',
  description: null,
  coverUrl: null,
  visibility: PlaylistVisibility.PRIVATE,
  version: 0,
  nextPosition: 0,
  createdAt: now,
  updatedAt: now,
  isDeleted: false,
  deletedAt: null,
};

const trackInput = {
  provider: MusicProvider.SPOTIFY,
  providerTrackId: 'spotify-track',
  title: 'A song',
  artists: [{ id: 'artist-id', name: 'Artist' }],
  album: 'Album',
  imageUrl: 'https://i.scdn.co/image/cover',
  externalUrl: 'https://open.spotify.com/track/spotify-track',
  durationMs: 180_000,
  isrc: 'TEST123',
};

function serviceWith(prisma: Record<string, unknown>) {
  const client = prisma as unknown as PrismaService;
  const access = new PlaylistAccessService();
  const input = new PlaylistInputService();
  return new PlaylistsService(
    new PlaylistQueryService(client, access),
    new PlaylistCommandService(client, access, input),
    new PlaylistItemsCommandService(client, access, input),
  );
}

function transactional(tx: Record<string, unknown>) {
  return {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
}

describe('PlaylistsService', () => {
  it('lists only active playlists owned by the authenticated user', async () => {
    const findMany = jest.fn().mockResolvedValue([playlist]);
    const service = serviceWith({ playlist: { findMany } });

    await expect(service.list(ownerId, undefined, 500)).resolves.toEqual([
      playlist,
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: ownerId, isDeleted: false },
        take: 50,
      }),
    );
  });

  it('creates a private playlist for the authenticated owner and audits it', async () => {
    const tx = {
      playlist: { create: jest.fn().mockResolvedValue(playlist) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = serviceWith(transactional(tx));

    await expect(
      service.create({ name: '  Favoris  ' }, ownerId),
    ).resolves.toEqual(playlist);
    expect(tx.playlist.create).toHaveBeenCalledWith({
      data: {
        userId: ownerId,
        name: 'Favoris',
        description: null,
        coverUrl: null,
        visibility: undefined,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('soft-deletes only a playlist owned by the authenticated user', async () => {
    const tx = {
      playlist: {
        findFirst: jest.fn().mockResolvedValue(playlist),
        update: jest.fn().mockResolvedValue({ ...playlist, isDeleted: true }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = serviceWith(transactional(tx));

    await expect(service.delete(playlistId, ownerId)).resolves.toBe(true);
    expect(tx.playlist.findFirst).toHaveBeenCalledWith({
      where: { id: playlistId, userId: ownerId, isDeleted: false },
    });
    expect(tx.playlist.update).toHaveBeenCalledWith({
      where: { id: playlistId },
      data: {
        isDeleted: true,
        deletedAt: expect.any(Date) as Date,
        version: { increment: 1 },
      },
    });
  });

  it('does not reveal whether a playlist owned by somebody else exists', async () => {
    const tx = {
      playlist: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = serviceWith(transactional(tx));

    await expect(service.delete(playlistId, ownerId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('adds a provider-scoped catalog track at an atomically allocated position', async () => {
    const catalogTrack = {
      id: '00000000-0000-4000-8000-000000000004',
      ...trackInput,
      artists: trackInput.artists,
      createdAt: now,
      updatedAt: now,
    };
    const createdItem = {
      id: itemId,
      playlistId,
      trackId: catalogTrack.id,
      addedById: ownerId,
      position: 3,
      createdAt: now,
      updatedAt: now,
      track: catalogTrack,
    };
    const tx = {
      playlist: {
        findFirst: jest.fn().mockResolvedValue(playlist),
        update: jest.fn().mockResolvedValue({ nextPosition: 4 }),
      },
      catalogTrack: { upsert: jest.fn().mockResolvedValue(catalogTrack) },
      playlistItem: { create: jest.fn().mockResolvedValue(createdItem) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = serviceWith(transactional(tx));

    await expect(
      service.addTrack({ playlistId, track: trackInput }, ownerId),
    ).resolves.toEqual(createdItem);
    expect(tx.catalogTrack.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerTrackId: {
            provider: MusicProvider.SPOTIFY,
            providerTrackId: 'spotify-track',
          },
        },
        update: {},
      }),
    );
    expect(tx.playlistItem.create).toHaveBeenCalledWith({
      data: {
        playlistId,
        trackId: catalogTrack.id,
        addedById: ownerId,
        position: 3,
      },
      include: { track: true },
    });
  });

  it('rejects an external URL that does not belong to the selected provider', async () => {
    const service = serviceWith({});

    await expect(
      service.addTrack(
        {
          playlistId,
          track: { ...trackInput, externalUrl: 'https://evil.example/track' },
        },
        ownerId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects stale reorder commands before changing item positions', async () => {
    const tx = {
      playlist: {
        findFirst: jest.fn().mockResolvedValue(playlist),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = serviceWith(transactional(tx));

    await expect(
      service.reorder(
        { playlistId, orderedItemIds: [itemId], expectedVersion: 4 },
        ownerId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reorders every item in two passes and advances the playlist version', async () => {
    const secondItemId = '00000000-0000-4000-8000-000000000005';
    const tx = {
      playlist: {
        findFirst: jest.fn().mockResolvedValue(playlist),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ ...playlist, version: 1 }),
      },
      playlistItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: itemId }, { id: secondItemId }]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        update: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = serviceWith(transactional(tx));

    await service.reorder(
      {
        playlistId,
        orderedItemIds: [secondItemId, itemId],
        expectedVersion: 0,
      },
      ownerId,
    );

    expect(tx.playlistItem.updateMany).toHaveBeenCalledWith({
      where: { playlistId },
      data: { position: { increment: 3 } },
    });
    expect(tx.playlistItem.update).toHaveBeenNthCalledWith(1, {
      where: { id: secondItemId },
      data: { position: 0 },
    });
    expect(tx.playlistItem.update).toHaveBeenNthCalledWith(2, {
      where: { id: itemId },
      data: { position: 1 },
    });
  });
});
