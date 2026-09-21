import {
  Args,
  Context,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FriendshipModel, UserModel } from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Resolver(() => FriendshipModel)
export class FriendshipsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Query(() => [UserModel], { name: 'searchUsers' })
  async searchUsers(
    @Args('query') query: string,
    @Args('take', { type: () => Int, defaultValue: 20 }) take: number,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<UserModel[]> {
    const value = query.trim();
    if (value.length === 1 || value.length > 50) return [];
    const actorId = context.req.user.sub;
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

  @Query(() => [FriendshipModel], { name: 'myFriendships' })
  async myFriendships(
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<FriendshipModel[]> {
    const userId = context.req.user.sub;
    return this.prisma.friendship.findMany({
      where: {
        isDeleted: false,
        OR: [{ requesterId: userId }, { receiverId: userId }],
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Mutation(() => FriendshipModel)
  async sendFriendRequest(
    @Args('receiverId') receiverId: string,
    @Context() context: { req: { user: { sub: string; username: string } } },
  ): Promise<FriendshipModel> {
    const actorId = context.req.user.sub;
    if (receiverId === actorId)
      throw new BadRequestException(
        'Vous ne pouvez pas vous ajouter vous-même.',
      );
    const receiver = await this.prisma.user.findFirst({
      where: { id: receiverId, status: 'ACTIVE', isDeleted: false },
    });
    if (!receiver) throw new NotFoundException('Utilisateur introuvable.');
    const reverse = await this.prisma.friendship.findFirst({
      where: {
        requesterId: receiverId,
        receiverId: actorId,
        isDeleted: false,
        status: { in: ['PENDING', 'ACCEPTED', 'BLOCKED'] },
      },
    });
    if (reverse)
      throw new BadRequestException(
        'Une relation existe déjà avec cet utilisateur.',
      );
    const friendship = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.friendship.findUnique({
        where: { requesterId_receiverId: { requesterId: actorId, receiverId } },
      });
      if (
        previous &&
        ['PENDING', 'ACCEPTED', 'BLOCKED'].includes(previous.status)
      )
        throw new BadRequestException(
          'Une relation existe déjà avec cet utilisateur.',
        );
      const friendship = previous
        ? await tx.friendship.update({
            where: { id: previous.id },
            data: { status: 'PENDING', isDeleted: false, deletedAt: null },
          })
        : await tx.friendship.create({
            data: { requesterId: actorId, receiverId },
          });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'FRIEND_REQUESTED',
          entityType: 'friendship',
          entityId: friendship.id,
          metadata: { receiverId },
        },
      });
      return friendship;
    });
    await this.notifications.friendRequested(
      actorId,
      context.req.user.username,
      receiverId,
    );
    return friendship;
  }

  @Mutation(() => FriendshipModel)
  async respondFriendRequest(
    @Args('id') id: string,
    @Args('accept') accept: boolean,
    @Context() context: { req: { user: { sub: string; username: string } } },
  ): Promise<FriendshipModel> {
    const actorId = context.req.user.sub;
    const row = await this.prisma.friendship.findFirst({
      where: { id, receiverId: actorId, status: 'PENDING', isDeleted: false },
    });
    if (!row) throw new NotFoundException('Demande introuvable.');
    const friendship = await this.prisma.$transaction(async (tx) => {
      const friendship = await tx.friendship.update({
        where: { id },
        data: { status: accept ? 'ACCEPTED' : 'REJECTED' },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: accept ? 'FRIEND_ACCEPTED' : 'FRIEND_REJECTED',
          entityType: 'friendship',
          entityId: id,
          metadata: { requesterId: row.requesterId },
        },
      });
      return friendship;
    });
    if (accept)
      await this.notifications.friendAccepted(
        actorId,
        context.req.user.username,
        row.requesterId,
      );
    return friendship;
  }

  @Mutation(() => FriendshipModel)
  async removeFriend(
    @Args('id') id: string,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<FriendshipModel> {
    const actorId = context.req.user.sub;
    const row = await this.prisma.friendship.findFirst({
      where: {
        id,
        isDeleted: false,
        OR: [{ requesterId: actorId }, { receiverId: actorId }],
      },
    });
    if (!row) throw new ForbiddenException('Action interdite.');
    return this.prisma.$transaction(async (tx) => {
      const friendship = await tx.friendship.update({
        where: { id },
        data: { status: 'CANCELED', isDeleted: true, deletedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'FRIEND_REMOVED',
          entityType: 'friendship',
          entityId: id,
          metadata: {},
        },
      });
      return friendship;
    });
  }

  @ResolveField(() => UserModel) requester(@Parent() row: FriendshipModel) {
    return this.prisma.user.findUnique({ where: { id: row.requesterId } });
  }
  @ResolveField(() => UserModel) receiver(@Parent() row: FriendshipModel) {
    return this.prisma.user.findUnique({ where: { id: row.receiverId } });
  }
}
