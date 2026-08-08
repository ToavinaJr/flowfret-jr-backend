import {
  Args,
  Mutation,
  Parent,
  ResolveField,
  Query,
  Resolver,
} from '@nestjs/graphql';
import {
  CreateNotificationInput,
  NotificationModel,
  UpdateNotificationInput,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => NotificationModel)
export class NotificationsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [NotificationModel], { name: 'notifications' })
  async notifications(): Promise<NotificationModel[]> {
    return this.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  @Query(() => NotificationModel, { name: 'notification', nullable: true })
  async notification(
    @Args('id') id: string,
  ): Promise<NotificationModel | null> {
    return this.prisma.notification.findFirst({ where: { id, isDeleted: false } });
  }

  @Mutation(() => NotificationModel)
  async createNotification(
    @Args('data') data: CreateNotificationInput,
  ): Promise<NotificationModel> {
    return this.prisma.notification.create({ data });
  }

  @Mutation(() => NotificationModel)
  async updateNotification(
    @Args('id') id: string,
    @Args('data') data: UpdateNotificationInput,
  ): Promise<NotificationModel> {
    return this.prisma.notification.update({ where: { id }, data });
  }

  @Mutation(() => NotificationModel)
  async deleteNotification(@Args('id') id: string): Promise<NotificationModel> {
    return this.prisma.notification.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
  }

  @ResolveField(() => UserModel, { name: 'user' })
  async user(
    @Parent() notification: NotificationModel,
  ): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: notification.userId } });
  }
}
