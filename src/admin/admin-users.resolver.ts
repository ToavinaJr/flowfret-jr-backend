import { ParseUUIDPipe } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { Prisma, UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { buildAdminPage, decodeAdminPage } from './admin-pagination';
import {
  AdminSortDirection,
  AdminUser,
  AdminUserConnection,
  AdminUsersInput,
  AdminUserSortField,
} from './admin.types';

@Roles(UserRole.ADMIN)
@Resolver()
export class AdminUsersResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => AdminUserConnection, { name: 'adminUsers' })
  async users(
    @Args('input', { type: () => AdminUsersInput, nullable: true })
    input?: AdminUsersInput,
  ): Promise<AdminUserConnection> {
    const page = decodeAdminPage(input);
    const search = input?.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(input?.includeDeleted ? {} : { isDeleted: false }),
      ...(input?.status ? { status: input.status } : {}),
      ...(input?.role ? { role: input.role } : {}),
      ...(search
        ? {
            OR: [
              { username: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              {
                profile: {
                  is: {
                    displayName: { contains: search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const direction: Prisma.SortOrder =
      input?.direction === AdminSortDirection.ASC ? 'asc' : 'desc';
    const sortField = {
      [AdminUserSortField.CREATED_AT]: 'createdAt',
      [AdminUserSortField.UPDATED_AT]: 'updatedAt',
      [AdminUserSortField.USERNAME]: 'username',
      [AdminUserSortField.EMAIL]: 'email',
      [AdminUserSortField.LAST_LOGIN_AT]: 'lastLoginAt',
    }[
      input?.sortBy ?? AdminUserSortField.CREATED_AT
    ] as keyof Prisma.UserOrderByWithRelationInput;
    const [rows, totalCount] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: page.skip,
        take: page.take + 1,
        orderBy: [{ [sortField]: direction }, { id: direction }],
        select: {
          id: true,
          email: true,
          username: true,
          status: true,
          role: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          isDeleted: true,
          deletedAt: true,
          profile: { select: { displayName: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return buildAdminPage(
      rows.map((row) => this.toAdminUser(row)),
      totalCount,
      page,
    );
  }

  @Query(() => AdminUser, { name: 'adminUser', nullable: true })
  async user(
    @Args('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<AdminUser | null> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        status: true,
        role: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
        deletedAt: true,
        profile: { select: { displayName: true } },
      },
    });
    return row ? this.toAdminUser(row) : null;
  }

  private toAdminUser(row: {
    id: string;
    email: string;
    username: string;
    status: AdminUser['status'];
    role: AdminUser['role'];
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    isDeleted: boolean;
    deletedAt: Date | null;
    profile: { displayName: string } | null;
  }): AdminUser {
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      status: row.status,
      role: row.role,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isDeleted: row.isDeleted,
      deletedAt: row.deletedAt,
      displayName: row.profile?.displayName ?? null,
    };
  }
}
