import { UserStatus } from '@prisma/client';
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
});
