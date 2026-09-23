import { HttpStatus, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserStatus } from '@prisma/client';
import { ApplicationException } from '../common/application-exception';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { AuthSessionModel } from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';
import { hashOpaqueToken } from './auth.utils';

@Injectable()
export class AuthAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async sessions(
    userId: string,
    currentRefreshToken: string | null,
  ): Promise<AuthSessionModel[]> {
    const currentHash = currentRefreshToken
      ? hashOpaqueToken(currentRefreshToken)
      : null;
    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        isDeleted: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, tokenHash: true, createdAt: true, expiresAt: true },
    });
    return sessions.map(({ tokenHash, ...session }) => ({
      ...session,
      current: tokenHash === currentHash,
    }));
  }

  async revokeSession(id: string, userId: string): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id, userId, revokedAt: null, isDeleted: false },
      data: { revokedAt: new Date() },
    });
    if (!result.count) {
      throw new ApplicationException(
        'AUTH_SESSION_NOT_FOUND',
        'Session not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return true;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
    });
    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(currentPassword, user.passwordHash))
    ) {
      throw new ApplicationException(
        'AUTH_CURRENT_PASSWORD_INVALID',
        'Current password is invalid.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new ApplicationException(
        'AUTH_PASSWORD_UNCHANGED',
        'New password must be different.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: await bcrypt.hash(newPassword, 10) },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null, isDeleted: false },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: AUDIT_ACTION.PASSWORD_CHANGED,
          entityType: AUDIT_ENTITY.USER,
          entityId: userId,
          metadata: {},
        },
      });
    });
    return true;
  }

  async deleteAccount(
    userId: string,
    currentPassword: string | undefined,
    confirmation: string,
  ): Promise<boolean> {
    if (confirmation !== 'DELETE') {
      throw new ApplicationException(
        'ACCOUNT_DELETE_CONFIRMATION_INVALID',
        'Type DELETE to confirm account deletion.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
    });
    if (!user) {
      throw new ApplicationException(
        'ACCOUNT_NOT_FOUND',
        'Account not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      user.passwordHash &&
      (!currentPassword ||
        !(await bcrypt.compare(currentPassword, user.passwordHash)))
    ) {
      throw new ApplicationException(
        'AUTH_CURRENT_PASSWORD_INVALID',
        'Current password is invalid.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null, isDeleted: false },
        data: { revokedAt: new Date() },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          status: UserStatus.DELETED,
        },
      });
    });
    return true;
  }
}
