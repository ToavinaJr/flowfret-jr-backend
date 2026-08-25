import {
  Args,
  Mutation,
  Parent,
  ResolveField,
  Query,
  Resolver,
} from '@nestjs/graphql';
import {
  CreatePasswordResetTokenInput,
  CreateRefreshTokenInput,
  PasswordResetTokenModel,
  RefreshTokenModel,
  UpdatePasswordResetTokenInput,
  UpdateRefreshTokenInput,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';

@Roles(UserRole.ADMIN)
@Resolver(() => RefreshTokenModel)
export class AuthTokensResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [RefreshTokenModel], { name: 'refreshTokens' })
  async refreshTokens(): Promise<RefreshTokenModel[]> {
    return this.prisma.refreshToken.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  @Query(() => RefreshTokenModel, { name: 'refreshToken', nullable: true })
  async refreshToken(
    @Args('id') id: string,
  ): Promise<RefreshTokenModel | null> {
    return this.prisma.refreshToken.findUnique({ where: { id } });
  }

  @Query(() => [PasswordResetTokenModel], { name: 'passwordResetTokens' })
  async passwordResetTokens(): Promise<PasswordResetTokenModel[]> {
    return this.prisma.passwordResetToken.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  @Query(() => PasswordResetTokenModel, {
    name: 'passwordResetToken',
    nullable: true,
  })
  async passwordResetToken(
    @Args('id') id: string,
  ): Promise<PasswordResetTokenModel | null> {
    return this.prisma.passwordResetToken.findUnique({ where: { id } });
  }

  @Mutation(() => RefreshTokenModel)
  async createRefreshToken(
    @Args('data') data: CreateRefreshTokenInput,
  ): Promise<RefreshTokenModel> {
    return this.prisma.refreshToken.create({ data });
  }

  @Mutation(() => RefreshTokenModel)
  async updateRefreshToken(
    @Args('id') id: string,
    @Args('data') data: UpdateRefreshTokenInput,
  ): Promise<RefreshTokenModel> {
    return this.prisma.refreshToken.update({ where: { id }, data });
  }

  @Mutation(() => RefreshTokenModel)
  async deleteRefreshToken(@Args('id') id: string): Promise<RefreshTokenModel> {
    return this.prisma.refreshToken.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
  }

  @Mutation(() => PasswordResetTokenModel)
  async createPasswordResetToken(
    @Args('data') data: CreatePasswordResetTokenInput,
  ): Promise<PasswordResetTokenModel> {
    return this.prisma.passwordResetToken.create({ data });
  }

  @Mutation(() => PasswordResetTokenModel)
  async updatePasswordResetToken(
    @Args('id') id: string,
    @Args('data') data: UpdatePasswordResetTokenInput,
  ): Promise<PasswordResetTokenModel> {
    return this.prisma.passwordResetToken.update({ where: { id }, data });
  }

  @Mutation(() => PasswordResetTokenModel)
  async deletePasswordResetToken(
    @Args('id') id: string,
  ): Promise<PasswordResetTokenModel> {
    return this.prisma.passwordResetToken.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
  }

  @ResolveField(() => UserModel, { name: 'user' })
  async user(
    @Parent() token: RefreshTokenModel | PasswordResetTokenModel,
  ): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: token.userId } });
  }
}

@Roles(UserRole.ADMIN)
@Resolver(() => PasswordResetTokenModel)
export class PasswordResetTokensResolver {
  constructor(private readonly prisma: PrismaService) {}

  @ResolveField(() => UserModel, { name: 'user' })
  async user(
    @Parent() token: PasswordResetTokenModel,
  ): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: token.userId } });
  }
}
