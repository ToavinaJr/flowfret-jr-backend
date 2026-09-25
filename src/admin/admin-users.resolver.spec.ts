import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUsersResolver } from './admin-users.resolver';
import { AdminSortDirection, AdminUserSortField } from './admin.types';

describe('AdminUsersResolver', () => {
  const row = {
    id: '58ff8d10-c354-4aa8-8cb8-c64065a8ff78',
    email: 'member@example.com',
    username: 'member',
    passwordHash: 'must-not-be-returned-by-graphql',
    googleId: null,
    googleSignupCompleted: false,
    status: UserStatus.ACTIVE,
    role: UserRole.USER,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    isDeleted: false,
    deletedAt: null,
    profile: { displayName: 'Member' },
  };
  let receivedArgs: Prisma.UserFindManyArgs | undefined;
  const findMany = jest.fn((args: Prisma.UserFindManyArgs) => {
    receivedArgs = args;
    return Promise.resolve([row]);
  });
  const count = jest.fn().mockResolvedValue(1);
  const findUnique = jest.fn().mockResolvedValue(row);
  const prisma = {
    user: { findMany, count, findUnique },
    $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
  } as unknown as PrismaService;
  const resolver = new AdminUsersResolver(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('applies search, filters, sorting and soft-delete defaults', async () => {
    const result = await resolver.users({
      first: 10,
      search: 'member',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      sortBy: AdminUserSortField.EMAIL,
      direction: AdminSortDirection.ASC,
    });

    const args = receivedArgs!;
    expect(args.take).toBe(11);
    expect(args.where).toEqual(
      expect.objectContaining({
        isDeleted: false,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      }),
    );
    expect(args.orderBy).toEqual([{ email: 'asc' }, { id: 'asc' }]);
    expect(result.nodes[0]).toEqual(
      expect.objectContaining({ displayName: 'Member' }),
    );
    expect(result.nodes[0]).not.toHaveProperty('passwordHash');
    expect(result.nodes[0]).not.toHaveProperty('googleId');
    expect(result.totalCount).toBe(1);
  });
});
