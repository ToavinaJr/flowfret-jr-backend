import {
  Args,
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
  PasswordResetTokenModel,
  PostLikeModel,
  PostModel,
  PostReportModel,
  ProfileModel,
  UpdateUserInput,
  UploadModel,
  RefreshTokenModel,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => UserModel)
export class UsersResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [UserModel], { name: 'users' })
  async users(): Promise<UserModel[]> {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Query(() => UserModel, { name: 'user', nullable: true })
  async user(@Args('id') id: string): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  @Mutation(() => UserModel)
  async createUser(@Args('data') data: CreateUserInput): Promise<UserModel> {
    return this.prisma.user.create({ data });
  }

  @Mutation(() => UserModel)
  async updateUser(
    @Args('id') id: string,
    @Args('data') data: UpdateUserInput,
  ): Promise<UserModel> {
    return this.prisma.user.update({ where: { id }, data });
  }

  @Mutation(() => UserModel)
  async deleteUser(@Args('id') id: string): Promise<UserModel> {
    return this.prisma.user.delete({ where: { id } });
  }

  @ResolveField(() => ProfileModel, { name: 'profile', nullable: true })
  async profile(@Parent() user: UserModel): Promise<ProfileModel | null> {
    return this.prisma.profile.findUnique({ where: { userId: user.id } });
  }

  @ResolveField(() => [PostModel], { name: 'authoredPosts' })
  async authoredPosts(@Parent() user: UserModel): Promise<PostModel[]> {
    return this.prisma.post.findMany({
      where: { authorId: user.id },
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
  async uploads(@Parent() user: UserModel): Promise<UploadModel[]> {
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
  async auditLogs(@Parent() user: UserModel): Promise<AuditLogModel[]> {
    return this.prisma.auditLog.findMany({
      where: { actorId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [RefreshTokenModel], { name: 'refreshTokens' })
  async refreshTokens(@Parent() user: UserModel): Promise<RefreshTokenModel[]> {
    return this.prisma.refreshToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ResolveField(() => [PasswordResetTokenModel], {
    name: 'passwordResetTokens',
  })
  async passwordResetTokens(
    @Parent() user: UserModel,
  ): Promise<PasswordResetTokenModel[]> {
    return this.prisma.passwordResetToken.findMany({
      where: { userId: user.id },
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
