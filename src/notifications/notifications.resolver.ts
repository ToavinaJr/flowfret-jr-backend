import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import {
  NotificationModel,
  NotificationPreferenceModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => NotificationModel)
export class NotificationsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [NotificationModel], { name: 'myNotifications' })
  myNotifications(
    @Context() context: { req: { user: { sub: string } } },
    @Args('take', { type: () => Int, defaultValue: 50 }) take: number,
  ) {
    return this.prisma.notification.findMany({
      where: { userId: context.req.user.sub, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, take)),
    });
  }

  @Query(() => Int, { name: 'unreadNotificationCount' })
  unreadNotificationCount(
    @Context() context: { req: { user: { sub: string } } },
  ) {
    return this.prisma.notification.count({
      where: {
        userId: context.req.user.sub,
        isDeleted: false,
        readAt: null,
      },
    });
  }

  @Query(() => [NotificationPreferenceModel], {
    name: 'myNotificationPreferences',
  })
  myNotificationPreferences(
    @Context() context: { req: { user: { sub: string } } },
  ) {
    return this.prisma.notificationPreference.findMany({
      where: { userId: context.req.user.sub },
    });
  }

  @Mutation(() => NotificationModel)
  async markNotificationRead(
    @Args('id') id: string,
    @Context() context: { req: { user: { sub: string } } },
  ) {
    const row = await this.prisma.notification.findFirst({
      where: { id, userId: context.req.user.sub, isDeleted: false },
    });
    if (!row) throw new NotFoundException('Notification introuvable.');
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: row.readAt ?? new Date() },
    });
  }

  @Mutation(() => NotificationPreferenceModel)
  setNotificationPreference(
    @Args('type', { type: () => NotificationType }) type: NotificationType,
    @Args('enabled') enabled: boolean,
    @Context() context: { req: { user: { sub: string } } },
  ) {
    const allowed: NotificationType[] = [
      'FRIEND_REQUEST',
      'FRIEND_POST',
      'POST_LIKE',
      'POST_COMMENT',
      'FOLLOWED_POST_ACTIVITY',
    ];
    if (!allowed.includes(type))
      throw new ForbiddenException('Type de notification non configurable.');
    const userId = context.req.user.sub;
    return this.prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type, enabled },
      update: { enabled },
    });
  }
}
