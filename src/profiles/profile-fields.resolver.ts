import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { ProfileModel, UserModel } from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => ProfileModel)
export class ProfileFieldsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @ResolveField(() => UserModel, { name: 'user' })
  user(@Parent() profile: ProfileModel): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: profile.userId } });
  }
}
