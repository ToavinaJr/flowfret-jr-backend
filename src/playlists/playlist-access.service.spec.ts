import { NotFoundException } from '@nestjs/common';
import { PlaylistVisibility } from '@prisma/client';
import { PolicyViolationError } from '../policies/policy-violation.error';
import { PlaylistAccessService } from './playlist-access.service';

const ownerId = '00000000-0000-4000-8000-000000000001';
const editorId = '00000000-0000-4000-8000-000000000002';
const playlistId = '00000000-0000-4000-8000-000000000003';

describe('PlaylistAccessService', () => {
  function setup(role: 'VIEWER' | 'EDITOR' | null, isFriend = true) {
    const playlist = {
      id: playlistId,
      userId: ownerId,
      visibility: PlaylistVisibility.PRIVATE,
      isDeleted: false,
    };
    const client = {
      playlist: { findFirst: jest.fn().mockResolvedValue(playlist) },
      playlistCollaborator: {
        findUnique: jest.fn().mockResolvedValue(
          role ? { role, status: 'ACCEPTED' } : null,
        ),
      },
      friendship: {
        findFirst: jest
          .fn()
          .mockResolvedValue(isFriend ? { id: 'friendship' } : null),
      },
    };
    return { service: new PlaylistAccessService(), client, playlist };
  }

  it('allows the owner to edit without a collaborator row', async () => {
    const { service, client, playlist } = setup(null);

    await expect(
      service.requireCanEdit(client as never, playlistId, ownerId),
    ).resolves.toEqual(playlist);
    expect(client.playlistCollaborator.findUnique).not.toHaveBeenCalled();
  });

  it('allows an active friend with editor role to edit', async () => {
    const { service, client } = setup('EDITOR');

    await expect(
      service.requireCanEdit(client as never, playlistId, editorId),
    ).resolves.toBeDefined();
  });

  it('denies a viewer write access', async () => {
    const { service, client } = setup('VIEWER');

    await expect(
      service.requireCanEdit(client as never, playlistId, editorId),
    ).rejects.toBeInstanceOf(PolicyViolationError);
  });

  it('revokes collaborator access when the friendship is no longer active', async () => {
    const { service, client } = setup('EDITOR', false);

    await expect(
      service.requireCanEdit(client as never, playlistId, editorId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not reveal a missing or inaccessible playlist', async () => {
    const { service, client } = setup(null);
    client.playlist.findFirst.mockResolvedValue(null);

    await expect(
      service.requireCanRead(client as never, playlistId, editorId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
