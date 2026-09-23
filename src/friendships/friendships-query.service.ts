import { Injectable } from '@nestjs/common';
import { FriendshipModel, UserModel } from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FriendshipsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    actorId: string,
    query: string,
    take: number,
  ): Promise<UserModel[]> {
    const value = query.trim();
    if (value.length === 1 || value.length > 50) return [];
    const relations = await this.prisma.friendship.findMany({
      where: {
        isDeleted: false,
        status: { in: ['PENDING', 'ACCEPTED', 'BLOCKED'] },
        OR: [{ requesterId: actorId }, { receiverId: actorId }],
      },
      select: { requesterId: true, receiverId: true },
    });
    const excludedIds = [
      actorId,
      ...relations.flatMap((row) => [row.requesterId, row.receiverId]),
    ];
    return this.prisma.user.findMany({
      where: {
        id: { notIn: excludedIds },
        status: 'ACTIVE',
        isDeleted: false,
        ...(value
          ? {
              OR: [
                { username: { contains: value, mode: 'insensitive' as const } },
                {
                  profile: {
                    displayName: {
                      contains: value,
                      mode: 'insensitive' as const,
                    },
                    isDeleted: false,
                    visibility: { not: 'PRIVATE' as const },
                  },
                },
              ],
            }
          : {}),
      },
      take: Math.min(30, Math.max(1, take)),
      orderBy: { username: 'asc' },
    });
  }

  list(userId: string): Promise<FriendshipModel[]> {
    return this.prisma.friendship.findMany({
      where: {
        isDeleted: false,
        OR: [{ requesterId: userId }, { receiverId: userId }],
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
