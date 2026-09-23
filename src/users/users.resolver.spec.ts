import { ForbiddenException } from '@nestjs/common';
import type { GraphQLResolveInfo } from 'graphql';
import { UserRole, UserStatus } from '@prisma/client';
import { UserModel } from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';
import { UsersResolver } from './users.resolver';
import { UsersService } from './users.service';

const context = { req: { user: { sub: 'actor-id' } } };
const now = new Date('2026-01-01T00:00:00.000Z');

function resolverWith(prisma: Record<string, unknown>) {
  return new UsersResolver(
    new UsersService(prisma as unknown as PrismaService),
  );
}

function user(id: string, email = 'alice@example.com'): UserModel {
  return {
    id,
    email,
    username: 'alice',
    status: UserStatus.ACTIVE,
    role: UserRole.USER,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('UsersResolver privacy contracts', () => {
  it('returns email only to its owner', () => {
    const resolver = resolverWith({});
    const info = { path: { prev: null } } as unknown as GraphQLResolveInfo;

    expect(resolver.email(user('actor-id'), context, info)).toBe(
      'alice@example.com',
    );
    expect(() =>
      resolver.email(user('other-id', 'private@example.com'), context, info),
    ).toThrow(ForbiddenException);
  });

  it('allows email in authenticated public auth payloads only', () => {
    const resolver = resolverWith({});
    const loginInfo = {
      path: { prev: { prev: { key: 'login' } } },
    } as unknown as GraphQLResolveInfo;
    const arbitraryInfo = {
      path: { prev: { prev: { key: 'user' } } },
    } as unknown as GraphQLResolveInfo;

    expect(resolver.email(user('actor-id'), {}, loginInfo)).toBe(
      'alice@example.com',
    );
    expect(() => resolver.email(user('actor-id'), {}, arbitraryInfo)).toThrow(
      ForbiddenException,
    );
  });

  it('strips privileged fields from self-service updates', async () => {
    const prisma = {
      user: { update: jest.fn().mockResolvedValue({ id: 'actor-id' }) },
    };
    const resolver = resolverWith(prisma);

    await resolver.updateUser(
      'actor-id',
      {
        username: 'new-name',
        email: 'attacker@example.com',
        passwordHash: 'new-password',
        status: 'SUSPENDED',
      },
      context,
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'actor-id' },
      data: { username: 'new-name' },
    });
  });

  it('hides a private profile from another user', async () => {
    const prisma = {
      profile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'profile-id',
          userId: 'other-id',
          visibility: 'PRIVATE',
          isDeleted: false,
        }),
      },
    };
    const resolver = resolverWith(prisma);

    await expect(
      resolver.profile(user('other-id'), context),
    ).resolves.toBeNull();
  });

  it('maps authored post viewer state and upload sizes', async () => {
    const prisma = {
      friendship: { count: jest.fn().mockResolvedValue(1) },
      post: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'post-id',
            likes: [{ id: 'like-id' }],
            mentions: [{ user: { id: 'mentioned-id' } }],
            attachments: [
              {
                id: 'attachment-id',
                upload: { id: 'upload-id', fileSize: 5n },
              },
            ],
          },
        ]),
      },
    };
    const resolver = resolverWith(prisma);

    await expect(
      resolver.authoredPosts(user('other-id'), context),
    ).resolves.toEqual([
      expect.objectContaining({
        viewerHasLiked: true,
        viewerLikeId: 'like-id',
        mentionedUsers: [{ id: 'mentioned-id' }],
        attachments: [
          expect.objectContaining({
            upload: { id: 'upload-id', fileSize: '5' },
          }),
        ],
      }),
    ]);
  });
});
