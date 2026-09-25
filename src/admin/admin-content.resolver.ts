import { Args, Query, Resolver } from '@nestjs/graphql';
import { Prisma, UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { buildAdminPage, decodeAdminPage } from './admin-pagination';
import {
  AdminCommentConnection,
  AdminContentInput,
  AdminPostConnection,
  AdminPostReportConnection,
  AdminSortDirection,
} from './admin.types';

@Roles(UserRole.ADMIN)
@Resolver()
export class AdminContentResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => AdminPostConnection, { name: 'adminPosts' })
  async posts(
    @Args('input', { type: () => AdminContentInput, nullable: true })
    input?: AdminContentInput,
  ): Promise<AdminPostConnection> {
    const page = decodeAdminPage(input);
    const search = input?.search?.trim();
    const where: Prisma.PostWhereInput = {
      ...(input?.includeDeleted ? {} : { isDeleted: false }),
      ...(input?.postStatus ? { status: input.postStatus } : {}),
      ...(search
        ? {
            OR: [
              { content: { contains: search, mode: 'insensitive' } },
              {
                author: {
                  username: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const direction = this.direction(input);
    const [rows, totalCount] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        skip: page.skip,
        take: page.take + 1,
        orderBy: [{ createdAt: direction }, { id: direction }],
        include: { author: { select: { username: true } } },
      }),
      this.prisma.post.count({ where }),
    ]);
    return buildAdminPage(
      rows.map((row) => ({
        ...row,
        authorUsername: row.author.username,
      })),
      totalCount,
      page,
    );
  }

  @Query(() => AdminCommentConnection, { name: 'adminComments' })
  async comments(
    @Args('input', { type: () => AdminContentInput, nullable: true })
    input?: AdminContentInput,
  ): Promise<AdminCommentConnection> {
    const page = decodeAdminPage(input);
    const search = input?.search?.trim();
    const where: Prisma.CommentWhereInput = {
      ...(input?.includeDeleted ? {} : { isDeleted: false }),
      ...(input?.commentStatus ? { status: input.commentStatus } : {}),
      ...(search
        ? {
            OR: [
              { content: { contains: search, mode: 'insensitive' } },
              {
                author: {
                  username: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const direction = this.direction(input);
    const [rows, totalCount] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        skip: page.skip,
        take: page.take + 1,
        orderBy: [{ createdAt: direction }, { id: direction }],
        include: { author: { select: { username: true } } },
      }),
      this.prisma.comment.count({ where }),
    ]);
    return buildAdminPage(
      rows.map((row) => ({
        ...row,
        authorUsername: row.author.username,
      })),
      totalCount,
      page,
    );
  }

  @Query(() => AdminPostReportConnection, { name: 'adminPostReports' })
  async reports(
    @Args('input', { type: () => AdminContentInput, nullable: true })
    input?: AdminContentInput,
  ): Promise<AdminPostReportConnection> {
    const page = decodeAdminPage(input);
    const search = input?.search?.trim();
    const where: Prisma.PostReportWhereInput = {
      ...(input?.includeDeleted ? {} : { isDeleted: false }),
      ...(input?.reportStatus ? { status: input.reportStatus } : {}),
      ...(search
        ? {
            OR: [
              { reason: { contains: search, mode: 'insensitive' } },
              {
                reporter: {
                  username: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const direction = this.direction(input);
    const [rows, totalCount] = await this.prisma.$transaction([
      this.prisma.postReport.findMany({
        where,
        skip: page.skip,
        take: page.take + 1,
        orderBy: [{ createdAt: direction }, { id: direction }],
        include: { reporter: { select: { username: true } } },
      }),
      this.prisma.postReport.count({ where }),
    ]);
    return buildAdminPage(
      rows.map((row) => ({
        ...row,
        reporterUsername: row.reporter.username,
      })),
      totalCount,
      page,
    );
  }

  private direction(input?: AdminContentInput): Prisma.SortOrder {
    return input?.direction === AdminSortDirection.ASC ? 'asc' : 'desc';
  }
}
