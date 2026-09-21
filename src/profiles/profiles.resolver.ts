import {
  Args,
  Context,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
  Query,
} from '@nestjs/graphql';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CreateProfileInput,
  ProfileModel,
  UpdateProfileInput,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => ProfileModel)
export class ProfilesResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [ProfileModel], { name: 'profiles' })
  async profiles(): Promise<ProfileModel[]> {
    return this.prisma.profile.findMany({
      where: { isDeleted: false, visibility: 'PUBLIC' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Query(() => ProfileModel, { name: 'profile', nullable: true })
  async profile(
    @Args('id') id: string,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<ProfileModel | null> {
    const profile = await this.prisma.profile.findFirst({
      where: { id, isDeleted: false },
    });
    if (
      !profile ||
      profile.visibility === 'PUBLIC' ||
      profile.userId === context.req.user.sub
    )
      return profile;
    if (profile.visibility === 'PRIVATE') return null;
    const isFriend = await this.prisma.friendship.count({
      where: {
        status: 'ACCEPTED',
        isDeleted: false,
        OR: [
          { requesterId: profile.userId, receiverId: context.req.user.sub },
          { requesterId: context.req.user.sub, receiverId: profile.userId },
        ],
      },
    });
    return isFriend ? profile : null;
  }

  @Query(() => ProfileModel, { name: 'profileByUserId', nullable: true })
  async profileByUserId(
    @Args('userId') userId: string,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<ProfileModel | null> {
    const profile = await this.prisma.profile.findFirst({
      where: { userId, isDeleted: false },
    });
    if (
      !profile ||
      profile.visibility === 'PUBLIC' ||
      userId === context.req.user.sub
    )
      return profile;
    if (profile.visibility === 'PRIVATE') return null;
    const isFriend = await this.prisma.friendship.count({
      where: {
        status: 'ACCEPTED',
        isDeleted: false,
        OR: [
          { requesterId: userId, receiverId: context.req.user.sub },
          { requesterId: context.req.user.sub, receiverId: userId },
        ],
      },
    });
    return isFriend ? profile : null;
  }

  @Mutation(() => ProfileModel)
  async createProfile(
    @Args('data') data: CreateProfileInput,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<ProfileModel> {
    if (data.userId !== context.req.user.sub)
      throw new ForbiddenException('Action interdite.');
    const displayName = data.displayName.trim();
    if (
      !displayName ||
      displayName.length > 120 ||
      (data.bio?.length ?? 0) > 1000
    )
      throw new ForbiddenException('Profil invalide.');
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.profile.create({
        data: { ...data, displayName },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: 'PROFILE_CREATED',
          entityType: 'profile',
          entityId: profile.id,
          metadata: {},
        },
      });
      return profile;
    });
  }

  @Mutation(() => ProfileModel)
  async updateProfile(
    @Args('id') id: string,
    @Args('data') data: UpdateProfileInput,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<ProfileModel> {
    const profile = await this.prisma.profile.findFirst({
      where: { id, isDeleted: false },
    });
    if (!profile) throw new NotFoundException('Profil introuvable.');
    if (profile.userId !== context.req.user.sub)
      throw new ForbiddenException('Action interdite.');
    const safeData = { ...data };
    delete safeData.userId;
    if (safeData.displayName !== undefined) {
      safeData.displayName = safeData.displayName.trim();
    }
    if (
      (safeData.bio?.length ?? 0) > 1000 ||
      safeData.displayName === '' ||
      (safeData.displayName?.length ?? 0) > 120
    )
      throw new ForbiddenException('Profil invalide.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.profile.update({
        where: { id },
        data: safeData,
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: 'PROFILE_UPDATED',
          entityType: 'profile',
          entityId: id,
          metadata: { fields: Object.keys(safeData) },
        },
      });
      return updated;
    });
  }

  @Mutation(() => ProfileModel)
  async deleteProfile(
    @Args('id') id: string,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<ProfileModel> {
    const profile = await this.prisma.profile.findFirst({
      where: { id, isDeleted: false },
    });
    if (!profile || profile.userId !== context.req.user.sub)
      throw new ForbiddenException('Action interdite.');
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.profile.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: 'PROFILE_DELETED',
          entityType: 'profile',
          entityId: id,
          metadata: {},
        },
      });
      return deleted;
    });
  }

  @ResolveField(() => UserModel, { name: 'user' })
  async user(@Parent() profile: ProfileModel): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: profile.userId } });
  }
}
