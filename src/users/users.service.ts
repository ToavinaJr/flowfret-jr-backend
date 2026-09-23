import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  PostModel,
  ProfileModel,
  UpdateUserInput,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';
import { toPostModel } from '../posts/post.mapper';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  listSelf(userId: string): Promise<UserModel[]> {
    return this.prisma.user.findMany({
      where: { id: userId, isDeleted: false },
    });
  }

  find(id: string): Promise<UserModel | null> {
    return this.prisma.user.findFirst({ where: { id, isDeleted: false } });
  }

  update(
    id: string,
    data: UpdateUserInput,
    actorId: string,
  ): Promise<UserModel> {
    this.requireSelf(id, actorId);
    const safeData = { ...data };
    delete safeData.passwordHash;
    delete safeData.status;
    delete safeData.email;
    return this.prisma.user.update({ where: { id }, data: safeData });
  }

  delete(id: string, actorId: string): Promise<UserModel> {
    this.requireSelf(id, actorId);
    return this.prisma.user.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), status: 'DELETED' },
    });
  }

  async profile(
    user: UserModel,
    viewerId: string,
  ): Promise<ProfileModel | null> {
    const preloaded = 'profile' in user;
    const profile = preloaded
      ? (user.profile ?? null)
      : await this.prisma.profile.findFirst({
          where: { userId: user.id, isDeleted: false },
        });
    if (profile && 'isDeleted' in profile && profile.isDeleted) return null;
    if (!profile || user.id === viewerId || profile.visibility === 'PUBLIC')
      return profile;
    if (profile.visibility === 'PRIVATE') return null;
    return (await this.areFriends(user.id, viewerId)) ? profile : null;
  }

  async authoredPosts(userId: string, viewerId: string): Promise<PostModel[]> {
    const own = userId === viewerId;
    const friend = own || (await this.areFriends(userId, viewerId));
    const rows = await this.prisma.post.findMany({
      where: {
        authorId: userId,
        isDeleted: false,
        ...(own
          ? {}
          : {
              visibility: { in: friend ? ['PUBLIC', 'FRIENDS'] : ['PUBLIC'] },
            }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        author: { include: { profile: true } },
        likes: {
          where: { userId: viewerId, isDeleted: false },
          select: { id: true },
          take: 1,
        },
        attachments: {
          where: { isDeleted: false },
          orderBy: { position: 'asc' },
          include: { upload: true },
        },
        mentions: {
          where: { isDeleted: false },
          include: { user: { include: { profile: true } } },
        },
      },
    });
    return rows.map(toPostModel);
  }

  private requireSelf(userId: string, actorId: string): void {
    if (userId !== actorId) throw new ForbiddenException('Action interdite.');
  }

  private async areFriends(userId: string, viewerId: string): Promise<boolean> {
    return Boolean(
      await this.prisma.friendship.count({
        where: {
          status: 'ACCEPTED',
          isDeleted: false,
          OR: [
            { requesterId: userId, receiverId: viewerId },
            { requesterId: viewerId, receiverId: userId },
          ],
        },
      }),
    );
  }
}
