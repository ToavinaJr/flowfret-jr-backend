import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { AuthSessionService } from './auth-session.service';
import { EmailVerificationService } from './email-verification.service';
import { GoogleAuthService } from './google-auth.service';
import { GoogleProfileService } from './google-profile.service';
import { PasswordResetService } from './password-reset.service';

const activeUser = {
  id: 'user-id',
  email: 'alice@example.com',
  username: 'alice',
  passwordHash: 'hash',
  status: UserStatus.ACTIVE,
  isDeleted: false,
};

function setup() {
  const tx = {
    refreshToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    emailVerificationToken: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    passwordResetToken: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((argument: unknown) =>
      Array.isArray(argument)
        ? Promise.all(argument)
        : (argument as (client: typeof tx) => unknown)(tx),
    ),
  };
  const jwt = { sign: jest.fn().mockReturnValue('access-token') };
  const mail = {
    sendOtpVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'APP_URL') return 'https://app.example.com';
      if (key === 'GOOGLE_CLIENT_ID') return 'google-client';
      return undefined;
    }),
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    new AuthSessionService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    ),
    new EmailVerificationService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
      config as unknown as ConfigService,
    ),
    new PasswordResetService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
      config as unknown as ConfigService,
    ),
    new GoogleAuthService(
      prisma as unknown as PrismaService,
      new GoogleProfileService(config as unknown as ConfigService),
    ),
  );
  return { service, prisma, tx, jwt, mail };
}

describe('AuthService security contracts', () => {
  it('rejects registration when an identifier is already used', async () => {
    const { service, prisma, mail } = setup();
    prisma.user.findFirst.mockResolvedValue(activeUser);

    await expect(
      service.register({
        email: 'Alice@Example.com',
        username: 'alice',
        password: 'password-123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(mail.sendOtpVerificationEmail).not.toHaveBeenCalled();
  });

  it('creates a session only for an active password account', async () => {
    const { service, prisma, jwt } = setup();
    const passwordHash = await bcrypt.hash('password-123', 4);
    prisma.user.findUnique.mockResolvedValue({ ...activeUser, passwordHash });
    prisma.user.update.mockResolvedValue(activeUser);

    const result = await service.login({
      email: ' Alice@Example.com ',
      password: 'password-123',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'alice@example.com' },
    });
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-id' }),
    );
    expect(result.accessToken).toBe('access-token');
    expect(result.user.id).toBe(activeUser.id);
  });

  it('keeps password-reset requests opaque for unknown accounts', async () => {
    const { service, prisma, mail } = setup();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.requestPasswordReset('unknown@example.com'),
    ).resolves.toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('rejects malformed OTP values before querying the database', async () => {
    const { service, prisma } = setup();

    await expect(
      service.verifyEmail({ token: 'token', code: '12ab' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.emailVerificationToken.findUnique).not.toHaveBeenCalled();
  });

  it('rotates a valid refresh token atomically', async () => {
    const { service, prisma, tx } = setup();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-id',
      userId: activeUser.id,
      revokedAt: null,
      isDeleted: false,
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });

    const result = await service.refreshSession('refresh-token');

    expect(tx.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.refreshToken.create).toHaveBeenCalled();
    expect(result.refreshToken).not.toBe('refresh-token');
  });

  it('rejects an expired refresh token without rotating it', async () => {
    const { service, prisma, tx } = setup();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-id',
      revokedAt: null,
      isDeleted: false,
      expiresAt: new Date(Date.now() - 1),
      user: activeUser,
    });

    await expect(service.refreshSession('expired')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });
});
