import {
  Args,
  Context,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { FriendshipModel, UserModel } from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';
import { FriendshipsCommandService } from './friendships-command.service';
import { FriendshipsQueryService } from './friendships-query.service';

type RequestContext = { req: { user: { sub: string; username?: string } } };

@Resolver(() => FriendshipModel)
export class FriendshipsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: FriendshipsQueryService,
    private readonly commands: FriendshipsCommandService,
  ) {}

  @Query(() => [UserModel], { name: 'searchUsers' })
  searchUsers(
    @Args('query') query: string,
    @Args('take', { type: () => Int, defaultValue: 20 }) take: number,
    @Context() context: RequestContext,
  ): Promise<UserModel[]> {
    return this.queries.search(context.req.user.sub, query, take);
  }

  @Query(() => [FriendshipModel], { name: 'myFriendships' })
  myFriendships(
    @Context() context: RequestContext,
  ): Promise<FriendshipModel[]> {
    return this.queries.list(context.req.user.sub);
  }

  @Mutation(() => FriendshipModel)
  sendFriendRequest(
    @Args('receiverId') receiverId: string,
    @Context() context: RequestContext,
  ): Promise<FriendshipModel> {
    return this.commands.send(receiverId, context.req.user);
  }

  @Mutation(() => FriendshipModel)
  respondFriendRequest(
    @Args('id') id: string,
    @Args('accept') accept: boolean,
    @Context() context: RequestContext,
  ): Promise<FriendshipModel> {
    return this.commands.respond(id, accept, context.req.user);
  }

  @Mutation(() => FriendshipModel)
  removeFriend(
    @Args('id') id: string,
    @Context() context: RequestContext,
  ): Promise<FriendshipModel> {
    return this.commands.remove(id, context.req.user.sub);
  }

  @ResolveField(() => UserModel)
  requester(@Parent() row: FriendshipModel): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: row.requesterId } });
  }

  @ResolveField(() => UserModel)
  receiver(@Parent() row: FriendshipModel): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: row.receiverId } });
  }
}
