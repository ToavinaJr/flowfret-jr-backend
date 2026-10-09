import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Prisma, ReportStatus, UserRole } from '@prisma/client';
import { RateLimit } from '../auth/rate-limit.decorator';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  adminCreatedAtRange,
  buildAdminPage,
  decodeAdminPage,
} from './admin-pagination';
import {
  AdminCommentConnection,
  AdminContentInput,
  AdminModerateReportInput,
  AdminPostConnection,
  AdminPostReportConnection,
  AdminSortDirection,
} from './admin.types';
import { AdminModerationService } from './admin-moderation.service';

type AdminRequestContext = { req: { user: { sub: string } } };

@RateLimit(120, 60, true)
@Roles(UserRole.ADMIN)
@Resolver()
export class AdminContentResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: AdminModerationService,
  ) {}

  @Query(() => AdminPostConnection, { name: 'adminPosts' })
  async posts(
    @Args('input', { type: () => AdminContentInput, nullable: true })
    input?: AdminContentInput,
  ): Promise<AdminPostConnection> {
    const page = decodeAdminPage(input);
    const search = input?.search?.trim();
    const createdAt = adminCreatedAtRange(input?.from, input?.to);
    const where: Prisma.PostWhereInput = {
      ...(input?.includeDeleted ? {} : { isDeleted: false }),
      ...(input?.postStatus ? { status: input.postStatus } : {}),
      ...(createdAt ? { createdAt } : {}),
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
    const createdAt = adminCreatedAtRange(input?.from, input?.to);
    const where: Prisma.CommentWhereInput = {
      ...(input?.includeDeleted ? {} : { isDeleted: false }),
      ...(input?.commentStatus ? { status: input.commentStatus } : {}),
      ...(createdAt ? { createdAt } : {}),
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
    const createdAt = adminCreatedAtRange(input?.from, input?.to);
    const where: Prisma.PostReportWhereInput = {
      ...(input?.includeDeleted ? {} : { isDeleted: false }),
      ...(input?.reportStatus ? { status: input.reportStatus } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(search
        ? {
            OR: [
              { reason: { contains: search, mode: 'insensitive' } },
              {
                reporter: {
                  username: { contains: search, mode: 'insensitive' },
                },
              },
              {
                post: {
                  is: {
                    content: { contains: search, mode: 'insensitive' },
                  },
                },
              },
              {
                post: {
                  is: {
                    author: {
                      username: { contains: search, mode: 'insensitive' },
                    },
                  },
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
        include: {
          reporter: { select: { username: true } },
          post: {
            select: {
              content: true,
              status: true,
              visibility: true,
              isDeleted: true,
              author: { select: { username: true } },
            },
          },
        },
      }),
      this.prisma.postReport.count({ where }),
    ]);
    return buildAdminPage(
      rows.map((row) => ({
        ...row,
        reporterUsername: row.reporter.username,
        postContent: row.post.content,
        postAuthorUsername: row.post.author.username,
        postStatus: row.post.status,
        postVisibility: row.post.visibility,
        postIsDeleted: row.post.isDeleted,
      })),
      totalCount,
      page,
    );
  }

  @RateLimit(30, 60, true)
  @Mutation(() => ReportStatus, { name: 'adminModeratePostReport' })
  moderateReport(
    @Args('input') input: AdminModerateReportInput,
    @Context() context: AdminRequestContext,
  ): Promise<ReportStatus> {
    return this.moderation.moderateReport(
      context.req.user.sub,
      input.reportId,
      input.status,
      input.reason,
    );
  }

  private direction(input?: AdminContentInput): Prisma.SortOrder {
    return input?.direction === AdminSortDirection.ASC ? 'asc' : 'desc';
  }
}
