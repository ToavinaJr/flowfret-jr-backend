import {
  FriendshipStatus,
  ProfileVisibility,
  UserStatus,
} from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('does not expose inactive accounts to another user', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new UsersService({ user: { findFirst } } as never);

    await service.find('inactive-user', 'viewer-user');

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'inactive-user',
        isDeleted: false,
        OR: [{ id: 'viewer-user' }, { status: UserStatus.ACTIVE }],
      },
    });
  });

  it('allows the authenticated owner to resolve their own inactive account', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'owner-user' });
    const service = new UsersService({ user: { findFirst } } as never);

    await expect(service.find('owner-user', 'owner-user')).resolves.toEqual({
      id: 'owner-user',
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'owner-user',
        isDeleted: false,
        OR: [{ id: 'owner-user' }, { status: UserStatus.ACTIVE }],
      },
    });
  });

  it('exposes a friends-only avatar to an accepted friend', async () => {
    const friendshipFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 'friendship-id' });
    const service = new UsersService({
      profile: {
        findFirst: jest.fn().mockResolvedValue({
          avatarUrl: 'avatar.png',
          visibility: ProfileVisibility.FRIENDS,
        }),
      },
      friendship: { findFirst: friendshipFindFirst },
    } as never);

    await expect(
      service.socialAvatarUrl('actor-id', 'viewer-id'),
    ).resolves.toBe('avatar.png');
    expect(friendshipFindFirst).toHaveBeenCalledWith({
      where: {
        status: FriendshipStatus.ACCEPTED,
        isDeleted: false,
        OR: [
          { requesterId: 'actor-id', receiverId: 'viewer-id' },
          { requesterId: 'viewer-id', receiverId: 'actor-id' },
        ],
      },
      select: { id: true },
    });
  });

  it('does not expose a friends-only avatar to a pending friend requester', async () => {
    const service = new UsersService({
      profile: {
        findFirst: jest.fn().mockResolvedValue({
          avatarUrl: 'avatar.png',
          visibility: ProfileVisibility.FRIENDS,
        }),
      },
      friendship: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);

    await expect(
      service.socialAvatarUrl('actor-id', 'viewer-id'),
    ).resolves.toBeNull();
  });

  it('does not expose a private avatar to another user', async () => {
    const service = new UsersService({
      profile: {
        findFirst: jest.fn().mockResolvedValue({
          avatarUrl: 'private.png',
          visibility: ProfileVisibility.PRIVATE,
        }),
      },
      friendship: { findFirst: jest.fn() },
    } as never);

    await expect(
      service.socialAvatarUrl('actor-id', 'viewer-id'),
    ).resolves.toBeNull();
  });
});
