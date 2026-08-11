import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { createHash, randomBytes, randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  AuthPayload,
  GoogleAuthInput,
  LoginInput,
  RegisterInput,
  RegisterPendingPayload,
  UserModel,
  VerifyEmailInput,
} from '../graphql/graphql.types';
import { errorDetails } from '../common/debug';

const OTP_LENGTH = 4;
const OTP_TTL_MINUTES = 15;
const TOKEN_BYTES = 32;
const PASSWORD_RESET_TTL_MINUTES = 60;
const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 30;
const GENERIC_CREDENTIALS_ERROR = 'Identifiants invalides ou compte indisponible.';
const GENERIC_REGISTRATION_ERROR = 'Impossible de créer le compte avec les informations fournies.';
const GENERIC_GOOGLE_ERROR = 'Impossible de continuer avec Google. Vérifiez le parcours choisi et réessayez.';
const GENERIC_TOKEN_ERROR = 'Demande invalide ou expirée.';

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean | string;
  name?: string;
  given_name?: string;
  picture?: string;
}

export interface AuthSessionPayload extends AuthPayload {
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async register(input: RegisterInput): Promise<RegisterPendingPayload> {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { username: input.username }],
      },
    });

    if (existingUser) {
      this.logger.warn(JSON.stringify({ event: 'registration.rejected', reason: 'identifier_unavailable' }));
      throw new ConflictException(GENERIC_REGISTRATION_ERROR);
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        username: input.username,
        passwordHash,
        status: UserStatus.PENDING,
      },
    });

    const verification = await this.createAndSendOtp(user);

    return {
      email: user.email,
      verificationToken: verification.token,
      expiresAt: verification.expiresAt,
      message:
        'Un code OTP à 4 chiffres a été envoyé par e-mail. Validez votre compte pour vous connecter.',
    };
  }

  async login(input: LoginInput): Promise<AuthSessionPayload> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException(GENERIC_CREDENTIALS_ERROR);
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException(GENERIC_CREDENTIALS_ERROR);
    }

    if (user.status === UserStatus.PENDING) {
      this.logger.warn(JSON.stringify({ event: 'login.rejected', reason: 'account_unavailable' }));
      throw new UnauthorizedException(GENERIC_CREDENTIALS_ERROR);
    }

    if (user.status !== UserStatus.ACTIVE) {
      this.logger.warn(JSON.stringify({ event: 'login.rejected', reason: 'account_unavailable' }));
      throw new UnauthorizedException(GENERIC_CREDENTIALS_ERROR);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.createAuthPayload(user);
  }

  async loginWithGoogle(input: GoogleAuthInput): Promise<AuthSessionPayload> {
    const profile = await this.fetchGoogleProfile(input.accessToken);
    const emailVerified =
      profile.email_verified === true || profile.email_verified === 'true';

    if (!profile.email || !emailVerified) {
      throw new UnauthorizedException(GENERIC_GOOGLE_ERROR);
    }

    const googleId = profile.sub;

    let user = await this.prisma.user.findFirst({
      where: { googleId, googleSignupCompleted: true },
    });

    if (user) {
      if (
        user.status === UserStatus.SUSPENDED ||
        user.status === UserStatus.DELETED
      ) {
        this.logger.warn(JSON.stringify({ event: 'google_login.rejected', reason: 'account_unavailable' }));
        throw new UnauthorizedException(GENERIC_GOOGLE_ERROR);
      }

      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          status: UserStatus.ACTIVE,
          lastLoginAt: new Date(),
        },
      });

      return this.createAuthPayload(user);
    }

    this.logger.warn(JSON.stringify({ event: 'google_login.rejected', reason: 'account_unavailable' }));
    throw new UnauthorizedException(GENERIC_GOOGLE_ERROR);
  }

  async registerWithGoogle(input: GoogleAuthInput): Promise<AuthSessionPayload> {
    const profile = await this.fetchGoogleProfile(input.accessToken);
    const emailVerified = profile.email_verified === true || profile.email_verified === 'true';
    if (!profile.email || !emailVerified) throw new UnauthorizedException(GENERIC_GOOGLE_ERROR);
    const email = profile.email.toLowerCase();
    const googleId = profile.sub;
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
      include: { profile: true },
    });
    if (existing?.googleId === googleId && !existing.googleSignupCompleted && !existing.isDeleted) {
      const enrolled = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          googleSignupCompleted: true,
          status: UserStatus.ACTIVE,
          lastLoginAt: new Date(),
          profile: existing.profile ? undefined : {
            create: {
              displayName: profile.name ?? existing.username,
              avatarUrl: profile.picture ?? null,
            },
          },
        },
        include: { profile: true },
      });
      return this.createAuthPayload(enrolled);
    }
    if (existing) {
      this.logger.warn(JSON.stringify({ event: 'google_registration.rejected', reason: 'identifier_unavailable' }));
      throw new ConflictException(GENERIC_GOOGLE_ERROR);
    }
    const username = await this.allocateUniqueUsername(
      profile.name ?? profile.given_name ?? email.split('@')[0],
    );

    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        googleId,
        googleSignupCompleted: true,
        passwordHash: null,
        status: UserStatus.ACTIVE,
        lastLoginAt: new Date(),
        profile: {
          create: {
            displayName: profile.name ?? username,
            avatarUrl: profile.picture ?? null,
          },
        },
      },
    });

    return this.createAuthPayload(user);
  }

  async verifyEmail(input: VerifyEmailInput): Promise<AuthSessionPayload> {
    const code = input.code.trim();
    if (!/^\d{4}$/.test(code)) {
      throw new BadRequestException('OTP must be a 4-digit code.');
    }

    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { token: input.token },
      include: { user: true },
    });

    if (!record || record.usedAt) {
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    }

    const codeMatches = await bcrypt.compare(code, record.codeHash);
    if (!codeMatches) {
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    }

    if (record.user.status === UserStatus.ACTIVE) {
      await this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      return this.createAuthPayload(record.user);
    }

    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { status: UserStatus.ACTIVE },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailVerificationToken.updateMany({
        where: {
          userId: record.userId,
          usedAt: null,
          id: { not: record.id },
        },
        data: { usedAt: new Date() },
      }),
    ]);

    return this.createAuthPayload(user);
  }

  async resendVerificationEmail(
    verificationToken: string,
  ): Promise<RegisterPendingPayload> {
    const existing = await this.prisma.emailVerificationToken.findUnique({
      where: { token: verificationToken },
      include: { user: true },
    });

    if (!existing) {
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    }

    if (existing.user.status === UserStatus.ACTIVE) {
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    }

    const verification = await this.createAndSendOtp(existing.user);

    return {
      email: existing.user.email,
      verificationToken: verification.token,
      expiresAt: verification.expiresAt,
      message: 'Un nouveau code OTP a été envoyé par e-mail.',
    };
  }

  async requestPasswordReset(rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    // Always return the same response to avoid revealing registered addresses.
    if (!user || !user.passwordHash) return;

    const token = randomBytes(TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashResetToken(token);
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      }),
    ]);

    const appUrl =
      this.configService.get<string>('APP_URL') ?? 'http://localhost:5173';
    const resetLink = `${appUrl.replace(/\/$/, '')}/reset-password?token=${token}`;

    try {
      await this.mailService.sendPasswordResetEmail({
        to: user.email,
        username: user.username,
        resetLink,
        expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
      });
    } catch (error) {
      this.logger.error(
        `Unable to send password reset email for user ${user.id}`,
        errorDetails(error),
      );
    }
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const tokenHash = this.hashResetToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired password reset link.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const usedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: usedAt },
      }),
    ]);
  }

  async refreshSession(refreshToken: string): Promise<AuthSessionPayload> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !existing ||
      existing.revokedAt ||
      existing.isDeleted ||
      existing.expiresAt.getTime() <= Date.now() ||
      existing.user.isDeleted ||
      existing.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const nextToken = this.generateRefreshToken();
    const nextTokenHash = this.hashRefreshToken(nextToken);
    const now = new Date();
    const expiresAt = this.refreshTokenExpiresAt();

    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null, isDeleted: false },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) {
        throw new UnauthorizedException('Refresh token has already been used.');
      }
      await tx.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: nextTokenHash,
          expiresAt,
        },
      });
    });

    return this.createAuthPayload(existing.user, nextToken);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.hashRefreshToken(refreshToken),
        revokedAt: null,
        isDeleted: false,
      },
      data: { revokedAt: new Date() },
    });
  }

  private hashResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async fetchGoogleProfile(
    accessToken: string,
  ): Promise<GoogleUserInfo> {
    let response: Response;
    try {
      response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new UnauthorizedException('Unable to reach Google.');
    }

    if (!response.ok) {
      throw new UnauthorizedException('Invalid Google access token.');
    }

    const profile = (await response.json()) as GoogleUserInfo;
    if (!profile.sub) {
      throw new UnauthorizedException('Invalid Google profile.');
    }
    return profile;
  }

  private async allocateUniqueUsername(seed: string): Promise<string> {
    const base = seed
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40);

    const root = base.length >= 3 ? base : `user_${base || 'google'}`;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate =
        attempt === 0 ? root : `${root.slice(0, 40)}_${randomInt(1000, 9999)}`;
      const exists = await this.prisma.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });
      if (!exists) {
        return candidate.slice(0, 50);
      }
    }

    return `user_${randomBytes(6).toString('hex')}`.slice(0, 50);
  }

  private async createAndSendOtp(user: {
    id: string;
    email: string;
    username: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    const otpCode = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(
      OTP_LENGTH,
      '0',
    );
    const token = randomBytes(TOKEN_BYTES).toString('hex');
    const codeHash = await bcrypt.hash(otpCode, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await this.prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        codeHash,
        expiresAt,
      },
    });

    const appUrl =
      this.configService.get<string>('APP_URL') ?? 'http://localhost:5173';
    const verificationLink = `${appUrl.replace(/\/$/, '')}/verify-email?token=${token}`;

    await this.mailService.sendOtpVerificationEmail({
      to: user.email,
      username: user.username,
      otpCode,
      verificationLink,
      expiresInMinutes: OTP_TTL_MINUTES,
    });

    return { token, expiresAt };
  }

  private async createAuthPayload(
    user: UserModel,
    rotatedRefreshToken?: string,
  ): Promise<AuthSessionPayload> {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      username: user.username,
    });

    const refreshToken = rotatedRefreshToken ?? this.generateRefreshToken();
    if (!rotatedRefreshToken) {
      await this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashRefreshToken(refreshToken),
          expiresAt: this.refreshTokenExpiresAt(),
        },
      });
    }

    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  private generateRefreshToken(): string {
    return randomBytes(TOKEN_BYTES).toString('hex');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTokenExpiresAt(): Date {
    const configured = Number(
      this.configService.get<string>('REFRESH_TOKEN_TTL_DAYS') ??
        DEFAULT_REFRESH_TOKEN_TTL_DAYS,
    );
    const days = Number.isInteger(configured) && configured > 0
      ? configured
      : DEFAULT_REFRESH_TOKEN_TTL_DAYS;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
