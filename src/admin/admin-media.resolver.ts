import { Args, Query, Resolver } from '@nestjs/graphql';
import { Prisma, UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { buildAdminPage, decodeAdminPage } from './admin-pagination';
import {
  AdminChordTranscriptionConnection,
  AdminMediaInput,
  AdminSortDirection,
  AdminTranscriptionConnection,
  AdminUploadConnection,
} from './admin.types';

@Roles(UserRole.ADMIN)
@Resolver()
export class AdminMediaResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => AdminUploadConnection, { name: 'adminUploads' })
  async uploads(
    @Args('input', { type: () => AdminMediaInput, nullable: true })
    input?: AdminMediaInput,
  ): Promise<AdminUploadConnection> {
    const page = decodeAdminPage(input);
    const search = input?.search?.trim();
    const where: Prisma.UploadWhereInput = {
      ...(input?.includeDeleted ? {} : { isDeleted: false }),
      ...(input?.uploadStatus ? { status: input.uploadStatus } : {}),
      ...(search
        ? {
            OR: [
              { fileName: { contains: search, mode: 'insensitive' } },
              { fileType: { contains: search, mode: 'insensitive' } },
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
      this.prisma.upload.findMany({
        where,
        skip: page.skip,
        take: page.take + 1,
        orderBy: [{ createdAt: direction }, { id: direction }],
        include: { user: { select: { username: true } } },
      }),
      this.prisma.upload.count({ where }),
    ]);
    return buildAdminPage(
      rows.map((row) => ({
        ...row,
        username: row.user.username,
        fileSize: row.fileSize.toString(),
      })),
      totalCount,
      page,
    );
  }

  @Query(() => AdminTranscriptionConnection, { name: 'adminTranscriptions' })
  async transcriptions(
    @Args('input', { type: () => AdminMediaInput, nullable: true })
    input?: AdminMediaInput,
  ): Promise<AdminTranscriptionConnection> {
    const page = decodeAdminPage(input);
    const search = input?.search?.trim();
    const where: Prisma.TranscriptionWhereInput = {
      ...(input?.includeDeleted ? {} : { isDeleted: false }),
      ...(input?.transcriptionStatus
        ? { status: input.transcriptionStatus }
        : {}),
      ...(input?.provider ? { provider: input.provider } : {}),
      ...(search
        ? {
            OR: [
              { trackId: { contains: search, mode: 'insensitive' } },
              { title: { contains: search, mode: 'insensitive' } },
              { artist: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const direction = this.direction(input);
    const [rows, totalCount] = await this.prisma.$transaction([
      this.prisma.transcription.findMany({
        where,
        skip: page.skip,
        take: page.take + 1,
        orderBy: [{ createdAt: direction }, { id: direction }],
      }),
      this.prisma.transcription.count({ where }),
    ]);
    return buildAdminPage(rows, totalCount, page);
  }

  @Query(() => AdminChordTranscriptionConnection, {
    name: 'adminChordTranscriptions',
  })
  async chordTranscriptions(
    @Args('input', { type: () => AdminMediaInput, nullable: true })
    input?: AdminMediaInput,
  ): Promise<AdminChordTranscriptionConnection> {
    const page = decodeAdminPage(input);
    const search = input?.search?.trim();
    const where: Prisma.ChordTranscriptionWhereInput = {
      ...(input?.provider ? { provider: input.provider } : {}),
      ...(search
        ? {
            OR: [
              {
                providerTrackId: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              { title: { contains: search, mode: 'insensitive' } },
              { artist: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const direction = this.direction(input);
    const [rows, totalCount] = await this.prisma.$transaction([
      this.prisma.chordTranscription.findMany({
        where,
        skip: page.skip,
        take: page.take + 1,
        orderBy: [{ createdAt: direction }, { id: direction }],
      }),
      this.prisma.chordTranscription.count({ where }),
    ]);
    return buildAdminPage(
      rows.map((row) => ({
        ...row,
        cueCount: Array.isArray(row.cues) ? row.cues.length : 0,
      })),
      totalCount,
      page,
    );
  }

  private direction(input?: AdminMediaInput): Prisma.SortOrder {
    return input?.direction === AdminSortDirection.ASC ? 'asc' : 'desc';
  }
}
