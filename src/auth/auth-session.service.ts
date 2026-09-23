import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { AuthPayload, UserModel } from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_REFRESH_TOKEN_TTL_DAYS } from './auth.constants';
import { generateOpaqueToken, hashOpaqueToken } from './auth.utils';

export interface AuthSessionPayload extends AuthPayload {
  refreshToken: string;
}

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async create(
    user: UserModel,
    rotatedRefreshToken?: string,
  ): Promise<AuthSessionPayload> {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      username: user.username,
    });
    const refreshToken = rotatedRefreshToken ?? generateOpaqueToken();
    if (!rotatedRefreshToken) {
      await this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashOpaqueToken(refreshToken),
          expiresAt: this.expiresAt(),
        },
      });
    }
    return { accessToken, refreshToken, user };
  }

  async refresh(refreshToken: string): Promise<AuthSessionPayload> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashOpaqueToken(refreshToken) },
      include: { user: true },
    });
    if (
      !existing ||
      existing.revokedAt ||
      existing.isDeleted ||
      existing.expiresAt.getTime() <= Date.now() ||
      existing.user.isDeleted ||
      existing.user.status !== UserStatus.ACTIVE
    )
      throw new UnauthorizedException('Invalid or expired refresh token.');

    const nextToken = generateOpaqueToken();
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null, isDeleted: false },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1)
        throw new UnauthorizedException('Refresh token has already been used.');
      await tx.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: hashOpaqueToken(nextToken),
          expiresAt: this.expiresAt(),
        },
      });
    });
    return this.create(existing.user, nextToken);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: hashOpaqueToken(refreshToken),
        revokedAt: null,
        isDeleted: false,
      },
      data: { revokedAt: new Date() },
    });
  }

  private expiresAt(): Date {
    const configured = Number(
      this.configService.get<string>('REFRESH_TOKEN_TTL_DAYS') ??
        DEFAULT_REFRESH_TOKEN_TTL_DAYS,
    );
    const days =
      Number.isInteger(configured) && configured > 0
        ? configured
        : DEFAULT_REFRESH_TOKEN_TTL_DAYS;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
