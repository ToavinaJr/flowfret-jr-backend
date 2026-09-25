import { Args, Query, Resolver } from '@nestjs/graphql';
import { Prisma, UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { buildAdminPage, decodeAdminPage } from './admin-pagination';
import {
  AdminCatalogTrackConnection,
  AdminListeningHistoryConnection,
  AdminMusicInput,
  AdminPlaylistConnection,
  AdminSortDirection,
} from './admin.types';

@Roles(UserRole.ADMIN)
@Resolver()
export class AdminMusicResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => AdminPlaylistConnection, { name: 'adminPlaylists' })
  async playlists(
    @Args('input', { type: () => AdminMusicInput, nullable: true })
    input?: AdminMusicInput,
  ): Promise<AdminPlaylistConnection> {
    const page = decodeAdminPage(input);
    const search = input?.search?.trim();
    const where: Prisma.PlaylistWhereInput = {
      ...(input?.includeDeleted ? {} : { isDeleted: false }),
      ...(input?.userId ? { userId: input.userId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              {
                user: {
                  username: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const direction = this.direction(input);
    const [rows, totalCount] = await this.prisma.$transaction([
      this.prisma.playlist.findMany({
        where,
        skip: page.skip,
        take: page.take + 1,
        orderBy: [{ createdAt: direction }, { id: direction }],
        include: {
          user: { select: { username: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.playlist.count({ where }),
    ]);
    return buildAdminPage(
      rows.map((row) => ({
        ...row,
        username: row.user.username,
        itemCount: row._count.items,
      })),
      totalCount,
      page,
    );
  }

  @Query(() => AdminCatalogTrackConnection, { name: 'adminCatalogTracks' })
  async catalogTracks(
    @Args('input', { type: () => AdminMusicInput, nullable: true })
    input?: AdminMusicInput,
  ): Promise<AdminCatalogTrackConnection> {
    const page = decodeAdminPage(input);
    const search = input?.search?.trim();
    const where: Prisma.CatalogTrackWhereInput = {
      ...(input?.provider ? { provider: input.provider } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { album: { contains: search, mode: 'insensitive' } },
              { genre: { contains: search, mode: 'insensitive' } },
              {
                providerTrackId: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const direction = this.direction(input);
    const [rows, totalCount] = await this.prisma.$transaction([
      this.prisma.catalogTrack.findMany({
        where,
        skip: page.skip,
        take: page.take + 1,
        orderBy: [{ createdAt: direction }, { id: direction }],
        include: { _count: { select: { playlistItems: true } } },
      }),
      this.prisma.catalogTrack.count({ where }),
    ]);
    return buildAdminPage(
      rows.map((row) => ({
        ...row,
        playlistCount: row._count.playlistItems,
      })),
      totalCount,
      page,
    );
  }

  @Query(() => AdminListeningHistoryConnection, {
    name: 'adminListeningHistory',
  })
  async listeningHistory(
    @Args('input', { type: () => AdminMusicInput, nullable: true })
    input?: AdminMusicInput,
  ): Promise<AdminListeningHistoryConnection> {
    const page = decodeAdminPage(input);
    const search = input?.search?.trim();
    const where: Prisma.ListeningHistoryWhereInput = {
      ...(input?.provider ? { provider: input.provider } : {}),
      ...(input?.userId ? { userId: input.userId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              {
                providerTrackId: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                user: {
                  username: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const direction = this.direction(input);
    const [rows, totalCount] = await this.prisma.$transaction([
      this.prisma.listeningHistory.findMany({
        where,
        skip: page.skip,
        take: page.take + 1,
        orderBy: [{ lastPlayedAt: direction }, { id: direction }],
        include: { user: { select: { username: true } } },
      }),
      this.prisma.listeningHistory.count({ where }),
    ]);
    return buildAdminPage(
      rows.map((row) => ({ ...row, username: row.user.username })),
      totalCount,
      page,
    );
  }

  private direction(input?: AdminMusicInput): Prisma.SortOrder {
    return input?.direction === AdminSortDirection.ASC ? 'asc' : 'desc';
  }
}
