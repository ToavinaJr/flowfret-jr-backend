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
    return this.prisma.profile.findMany({ where: { isDeleted: false }, orderBy: { createdAt: 'desc' } });
  }

  @Query(() => ProfileModel, { name: 'profile', nullable: true })
  async profile(@Args('id') id: string): Promise<ProfileModel | null> {
    return this.prisma.profile.findFirst({ where: { id, isDeleted: false } });
  }

  @Query(() => ProfileModel, { name: 'profileByUserId', nullable: true })
  async profileByUserId(
    @Args('userId') userId: string,
  ): Promise<ProfileModel | null> {
    return this.prisma.profile.findFirst({ where: { userId, isDeleted: false } });
  }

  @Mutation(() => ProfileModel)
  async createProfile(
    @Args('data') data: CreateProfileInput,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<ProfileModel> {
    if (data.userId !== context.req.user.sub) throw new ForbiddenException('Action interdite.');
    return this.prisma.profile.create({ data });
  }

  @Mutation(() => ProfileModel)
  async updateProfile(
    @Args('id') id: string,
    @Args('data') data: UpdateProfileInput,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<ProfileModel> {
    const profile = await this.prisma.profile.findFirst({ where: { id, isDeleted: false } });
    if (!profile) throw new NotFoundException('Profil introuvable.');
    if (profile.userId !== context.req.user.sub) throw new ForbiddenException('Action interdite.');
    const { userId: _userId, ...safeData } = data;
    return this.prisma.profile.update({ where: { id }, data: safeData });
  }

  @Mutation(() => ProfileModel)
  async deleteProfile(@Args('id') id: string): Promise<ProfileModel> {
    return this.prisma.profile.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
  }

  @ResolveField(() => UserModel, { name: 'user' })
  async user(@Parent() profile: ProfileModel): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: profile.userId } });
  }
}
