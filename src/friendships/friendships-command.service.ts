import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FriendshipModel } from '../graphql/graphql.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

export interface FriendshipActor {
  sub: string;
  username?: string;
}

@Injectable()
export class FriendshipsCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async send(
    receiverId: string,
    actor: FriendshipActor,
  ): Promise<FriendshipModel> {
    if (receiverId === actor.sub)
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
        receiverId: actor.sub,
        isDeleted: false,
        status: { in: ['PENDING', 'ACCEPTED', 'BLOCKED'] },
      },
    });
    if (reverse)
      throw new BadRequestException(
        'Une relation existe déjà avec cet utilisateur.',
      );
    let friendship: FriendshipModel;
    try {
      friendship = await this.prisma.$transaction(async (tx) => {
        const previous = await tx.friendship.findUnique({
          where: {
            requesterId_receiverId: {
              requesterId: actor.sub,
              receiverId,
            },
          },
        });
        if (
          previous &&
          ['PENDING', 'ACCEPTED', 'BLOCKED'].includes(previous.status)
        )
          throw new BadRequestException(
            'Une relation existe déjà avec cet utilisateur.',
          );
        const saved = previous
          ? await tx.friendship.update({
              where: { id: previous.id },
              data: { status: 'PENDING', isDeleted: false, deletedAt: null },
            })
          : await tx.friendship.create({
              data: { requesterId: actor.sub, receiverId },
            });
        await tx.auditLog.create({
          data: {
            actorId: actor.sub,
            action: 'FRIEND_REQUESTED',
            entityType: 'friendship',
            entityId: saved.id,
            metadata: { receiverId },
          },
        });
        return saved;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Une relation existe déjà avec cet utilisateur.',
        );
      throw error;
    }
    await this.notifications.friendRequested(
      actor.sub,
      actor.username ?? '',
      receiverId,
    );
    return friendship;
  }

  async respond(
    id: string,
    accept: boolean,
    actor: FriendshipActor,
  ): Promise<FriendshipModel> {
    const row = await this.prisma.friendship.findFirst({
      where: {
        id,
        receiverId: actor.sub,
        status: 'PENDING',
        isDeleted: false,
      },
    });
    if (!row) throw new NotFoundException('Demande introuvable.');
    const friendship = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.friendship.update({
        where: { id },
        data: { status: accept ? 'ACCEPTED' : 'REJECTED' },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: accept ? 'FRIEND_ACCEPTED' : 'FRIEND_REJECTED',
          entityType: 'friendship',
          entityId: id,
          metadata: { requesterId: row.requesterId },
        },
      });
      return saved;
    });
    if (accept)
      await this.notifications.friendAccepted(
        actor.sub,
        actor.username ?? '',
        row.requesterId,
      );
    return friendship;
  }

  async remove(id: string, actorId: string): Promise<FriendshipModel> {
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
}
