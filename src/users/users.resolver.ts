import {
  Args,
  Context,
  Info,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
  Query,
} from '@nestjs/graphql';
import {
  AuditLogModel,
  CommentModel,
  CreateUserInput,
  FriendshipModel,
  NotificationModel,
  PostLikeModel,
  PostModel,
  PostReportModel,
  ProfileModel,
  UpdateUserInput,
  UploadModel,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';
import type { GraphQLResolveInfo } from 'graphql';

@Resolver(() => UserModel)
export class UsersResolver {
  constructor(private readonly prisma: PrismaService) {}

  @ResolveField(() => String, { name: 'email' })
  email(@Parent() user: UserModel, @Context() context: { req?: { user?: { sub?: string } } }, @Info() info: GraphQLResolveInfo): string {
    // Public authentication mutations already prove ownership through Google
    // or the signed refresh cookie, before returning their AuthPayload.
    const requesterId = context.req?.user?.sub;
    const rootField = info.path.prev?.prev?.key;
    const authenticatedPayloads = new Set(['login', 'loginWithGoogle', 'registerWithGoogle', 'verifyEmail', 'refreshSession']);
    if ((!requesterId && !authenticatedPayloads.has(String(rootField))) || (requesterId && user.id !== requesterId)) throw new ForbiddenException('Information privée.');
    return user.email;
  }

  @Query(() => [UserModel], { name: 'users' })
  async users(@Context() context: { req: { user: { sub: string } } }): Promise<UserModel[]> {
    return this.prisma.user.findMany({ where: { id: context.req.user.sub, isDeleted: false } });
  }

  @Query(() => UserModel, { name: 'user', nullable: true })
  async user(@Args('id') id: string): Promise<UserModel | null> {
    return this.prisma.user.findFirst({ where: { id, isDeleted: false } });
  }

  @Mutation(() => UserModel)
  async createUser(@Args('data') _data: CreateUserInput): Promise<UserModel> {
    throw new ForbiddenException('Utilisez le parcours d’inscription sécurisé.');
  }

  @Mutation(() => UserModel)
  async updateUser(
    @Args('id') id: string,
    @Args('data') data: UpdateUserInput,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<UserModel> {
    if (id !== context.req.user.sub) throw new ForbiddenException('Action interdite.');
    const { passwordHash: _passwordHash, status: _status, email: _email, ...safeData } = data;
    return this.prisma.user.update({ where: { id }, data: safeData });
  }

  @Mutation(() => UserModel)
  async deleteUser(@Args('id') id: string, @Context() context: { req: { user: { sub: string } } }): Promise<UserModel> {
    if (id !== context.req.user.sub) throw new ForbiddenException('Action interdite.');
    return this.prisma.user.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date(), status: 'DELETED' } });
  }

  @ResolveField(() => ProfileModel, { name: 'profile', nullable: true })
  async profile(@Parent() user: UserModel, @Context() context: { req: { user: { sub: string } } }): Promise<ProfileModel | null> {
    const profile = await this.prisma.profile.findFirst({ where: { userId: user.id, isDeleted: false } });
    if (!profile || user.id === context.req.user.sub || profile.visibility === 'PUBLIC') return profile;
    if (profile.visibility === 'PRIVATE') return null;
    const friend = await this.prisma.friendship.count({ where: { status: 'ACCEPTED', isDeleted: false, OR: [{ requesterId: user.id, receiverId: context.req.user.sub }, { requesterId: context.req.user.sub, receiverId: user.id }] } });
    return friend ? profile : null;
  }

  @ResolveField(() => [PostModel], { name: 'authoredPosts' })
  async authoredPosts(@Parent() user: UserModel, @Context() context: { req: { user: { sub: string } } }): Promise<PostModel[]> {
    const own = user.id === context.req.user.sub;
    const friend = own ? true : Boolean(await this.prisma.friendship.count({ where: { status: 'ACCEPTED', isDeleted: false, OR: [{ requesterId: user.id, receiverId: context.req.user.sub }, { requesterId: context.req.user.sub, receiverId: user.id }] } }));
    return this.prisma.post.findMany({
      where: { authorId: user.id, isDeleted: false, ...(own ? {} : { visibility: { in: friend ? ['PUBLIC', 'FRIENDS'] : ['PUBLIC'] } }) },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [CommentModel], { name: 'comments' })
  async comments(@Parent() user: UserModel): Promise<CommentModel[]> {
    return this.prisma.comment.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [UploadModel], { name: 'uploads' })
  async uploads(@Parent() user: UserModel, @Context() context: { req: { user: { sub: string } } }): Promise<UploadModel[]> {
    if (user.id !== context.req.user.sub) throw new ForbiddenException('Action interdite.');
    const uploads = await this.prisma.upload.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    return uploads.map((upload) => ({
      ...upload,
      fileSize: upload.fileSize.toString(),
    }));
  }

  @ResolveField(() => [NotificationModel], { name: 'notifications' })
  async notifications(@Parent() user: UserModel): Promise<NotificationModel[]> {
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [AuditLogModel], { name: 'auditLogs' })
  async auditLogs(@Parent() user: UserModel, @Context() context: { req: { user: { sub: string } } }): Promise<AuditLogModel[]> {
    if (user.id !== context.req.user.sub) throw new ForbiddenException('Action interdite.');
    return this.prisma.auditLog.findMany({
      where: { actorId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [FriendshipModel], { name: 'friendshipsRequested' })
  async friendshipsRequested(
    @Parent() user: UserModel,
  ): Promise<FriendshipModel[]> {
    return this.prisma.friendship.findMany({
      where: { requesterId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [FriendshipModel], { name: 'friendshipsReceived' })
  async friendshipsReceived(
    @Parent() user: UserModel,
  ): Promise<FriendshipModel[]> {
    return this.prisma.friendship.findMany({
      where: { receiverId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [PostLikeModel], { name: 'likes' })
  async likes(@Parent() user: UserModel): Promise<PostLikeModel[]> {
    return this.prisma.postLike.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [PostReportModel], { name: 'reports' })
  async reports(@Parent() user: UserModel): Promise<PostReportModel[]> {
    return this.prisma.postReport.findMany({
      where: { reporterId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }
}
