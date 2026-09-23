import { ForbiddenException } from '@nestjs/common';
import {
  Args,
  Context,
  Info,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import {
  CreateUserInput,
  PostModel,
  ProfileModel,
  UpdateUserInput,
  UserModel,
} from '../graphql/graphql.types';
import { UsersService } from './users.service';

type RequestContext = { req: { user: { sub: string } } };
const AUTH_PAYLOAD_FIELDS = new Set([
  'login',
  'loginWithGoogle',
  'registerWithGoogle',
  'verifyEmail',
  'refreshSession',
]);

@Resolver(() => UserModel)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @ResolveField(() => String, { name: 'email' })
  email(
    @Parent() user: UserModel,
    @Context() context: { req?: { user?: { sub?: string } } },
    @Info() info: GraphQLResolveInfo,
  ): string {
    const requesterId = context.req?.user?.sub;
    const rootField = info.path.prev?.prev?.key;
    if (
      (!requesterId && !AUTH_PAYLOAD_FIELDS.has(String(rootField))) ||
      (requesterId && user.id !== requesterId)
    )
      throw new ForbiddenException('Information privée.');
    return user.email;
  }

  @Query(() => [UserModel], { name: 'users' })
  users(@Context() context: RequestContext): Promise<UserModel[]> {
    return this.usersService.listSelf(context.req.user.sub);
  }

  @Query(() => UserModel, { name: 'user', nullable: true })
  user(@Args('id') id: string): Promise<UserModel | null> {
    return this.usersService.find(id);
  }

  @Mutation(() => UserModel)
  createUser(@Args('data') data: CreateUserInput): UserModel {
    void data;
    throw new ForbiddenException(
      'Utilisez le parcours d’inscription sécurisé.',
    );
  }

  @Mutation(() => UserModel)
  updateUser(
    @Args('id') id: string,
    @Args('data') data: UpdateUserInput,
    @Context() context: RequestContext,
  ): Promise<UserModel> {
    return this.usersService.update(id, data, context.req.user.sub);
  }

  @Mutation(() => UserModel)
  deleteUser(
    @Args('id') id: string,
    @Context() context: RequestContext,
  ): Promise<UserModel> {
    return this.usersService.delete(id, context.req.user.sub);
  }

  @ResolveField(() => ProfileModel, { name: 'profile', nullable: true })
  profile(
    @Parent() user: UserModel,
    @Context() context: RequestContext,
  ): Promise<ProfileModel | null> {
    return this.usersService.profile(user, context.req.user.sub);
  }

  @ResolveField(() => [PostModel], { name: 'authoredPosts' })
  authoredPosts(
    @Parent() user: UserModel,
    @Context() context: RequestContext,
  ): Promise<PostModel[]> {
    return this.usersService.authoredPosts(user.id, context.req.user.sub);
  }
}
