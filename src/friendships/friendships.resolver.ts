import {
  Args,
  Mutation,
  Parent,
  ResolveField,
  Query,
  Resolver,
} from '@nestjs/graphql';
import {
  CreateFriendshipInput,
  FriendshipModel,
  UpdateFriendshipInput,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => FriendshipModel)
export class FriendshipsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [FriendshipModel], { name: 'friendships' })
  async friendships(): Promise<FriendshipModel[]> {
    return this.prisma.friendship.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Query(() => FriendshipModel, { name: 'friendship', nullable: true })
  async friendship(@Args('id') id: string): Promise<FriendshipModel | null> {
    return this.prisma.friendship.findUnique({ where: { id } });
  }

  @Mutation(() => FriendshipModel)
  async createFriendship(
    @Args('data') data: CreateFriendshipInput,
  ): Promise<FriendshipModel> {
    return this.prisma.friendship.create({ data });
  }

  @Mutation(() => FriendshipModel)
  async updateFriendship(
    @Args('id') id: string,
    @Args('data') data: UpdateFriendshipInput,
  ): Promise<FriendshipModel> {
    return this.prisma.friendship.update({ where: { id }, data });
  }

  @Mutation(() => FriendshipModel)
  async deleteFriendship(@Args('id') id: string): Promise<FriendshipModel> {
    return this.prisma.friendship.delete({ where: { id } });
  }

  @ResolveField(() => UserModel, { name: 'requester' })
  async requester(
    @Parent() friendship: FriendshipModel,
  ): Promise<UserModel | null> {
    return this.prisma.user.findUnique({
      where: { id: friendship.requesterId },
    });
  }

  @ResolveField(() => UserModel, { name: 'receiver' })
  async receiver(
    @Parent() friendship: FriendshipModel,
  ): Promise<UserModel | null> {
    return this.prisma.user.findUnique({
      where: { id: friendship.receiverId },
    });
  }
}
