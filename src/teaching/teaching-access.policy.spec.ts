import { ForbiddenException } from '@nestjs/common';
import { TeachingAccessPolicy } from './teaching-access.policy';

describe('TeachingAccessPolicy', () => {
  it('returns the active user fields needed by teaching workflows', async () => {
    const prisma = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'user-1', username: 'Ada' }),
      },
    };
    const policy = new TeachingAccessPolicy(prisma as never);

    await expect(policy.assertActiveUser('user-1')).resolves.toEqual({
      id: 'user-1',
      username: 'Ada',
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-1', status: 'ACTIVE', isDeleted: false },
      select: { id: true, username: true },
    });
  });

  it('rejects missing, inactive or deleted accounts', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(null) } };
    const policy = new TeachingAccessPolicy(prisma as never);

    await expect(policy.assertActiveUser('user-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
