import {
  Args,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
  Query,
} from '@nestjs/graphql';
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
    return this.prisma.profile.findUnique({ where: { userId } });
  }

  @Mutation(() => ProfileModel)
  async createProfile(
    @Args('data') data: CreateProfileInput,
  ): Promise<ProfileModel> {
    return this.prisma.profile.create({ data });
  }

  @Mutation(() => ProfileModel)
  async updateProfile(
    @Args('id') id: string,
    @Args('data') data: UpdateProfileInput,
  ): Promise<ProfileModel> {
    return this.prisma.profile.update({ where: { id }, data });
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
