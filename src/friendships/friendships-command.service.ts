import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FriendshipStatus, Prisma, UserStatus } from '@prisma/client';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY,
  FRIENDSHIP_CONFLICT_STATUSES,
} from '../common/domain.constants';
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
      where: { id: receiverId, status: UserStatus.ACTIVE, isDeleted: false },
    });
    if (!receiver) throw new NotFoundException('Utilisateur introuvable.');
    const reverse = await this.prisma.friendship.findFirst({
      where: {
        requesterId: receiverId,
        receiverId: actor.sub,
        isDeleted: false,
        status: { in: [...FRIENDSHIP_CONFLICT_STATUSES] },
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
        if (previous && FRIENDSHIP_CONFLICT_STATUSES.has(previous.status))
          throw new BadRequestException(
            'Une relation existe déjà avec cet utilisateur.',
          );
        const saved = previous
          ? await tx.friendship.update({
              where: { id: previous.id },
              data: {
                status: FriendshipStatus.PENDING,
                isDeleted: false,
                deletedAt: null,
              },
            })
          : await tx.friendship.create({
              data: { requesterId: actor.sub, receiverId },
            });
        await tx.auditLog.create({
          data: {
            actorId: actor.sub,
            action: AUDIT_ACTION.FRIEND_REQUESTED,
            entityType: AUDIT_ENTITY.FRIENDSHIP,
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
        status: FriendshipStatus.PENDING,
        isDeleted: false,
      },
    });
    if (!row) throw new NotFoundException('Demande introuvable.');
    const friendship = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.friendship.update({
        where: { id },
        data: {
          status: accept
            ? FriendshipStatus.ACCEPTED
            : FriendshipStatus.REJECTED,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: accept
            ? AUDIT_ACTION.FRIEND_ACCEPTED
            : AUDIT_ACTION.FRIEND_REJECTED,
          entityType: AUDIT_ENTITY.FRIENDSHIP,
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
        data: {
          status: FriendshipStatus.CANCELED,
          isDeleted: true,
          deletedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: AUDIT_ACTION.FRIEND_REMOVED,
          entityType: AUDIT_ENTITY.FRIENDSHIP,
          entityId: id,
          metadata: {},
        },
      });
      return friendship;
    });
  }
}
