import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { randomBytes, randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  AuthPayload,
  LoginInput,
  RegisterInput,
  RegisterPendingPayload,
  UserModel,
  VerifyEmailInput,
} from '../graphql/graphql.types';

const OTP_LENGTH = 4;
const OTP_TTL_MINUTES = 15;
const TOKEN_BYTES = 32;

@Injectable()
export class AuthService {
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
      throw new ConflictException('Email or username already in use');
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

  async login(input: LoginInput): Promise<AuthPayload> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === UserStatus.PENDING) {
      throw new ForbiddenException(
        'Account not verified. Please validate the OTP sent to your email.',
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.createAuthPayload(user);
  }

  async verifyEmail(input: VerifyEmailInput): Promise<AuthPayload> {
    const code = input.code.trim();
    if (!/^\d{4}$/.test(code)) {
      throw new BadRequestException('OTP must be a 4-digit code.');
    }

    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { token: input.token },
      include: { user: true },
    });

    if (!record || record.usedAt) {
      throw new BadRequestException('Invalid or already used verification link.');
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Verification code has expired.');
    }

    const codeMatches = await bcrypt.compare(code, record.codeHash);
    if (!codeMatches) {
      throw new BadRequestException('Invalid verification code.');
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
      throw new BadRequestException('Invalid verification link.');
    }

    if (existing.user.status === UserStatus.ACTIVE) {
      throw new BadRequestException('Account is already verified.');
    }

    const verification = await this.createAndSendOtp(existing.user);

    return {
      email: existing.user.email,
      verificationToken: verification.token,
      expiresAt: verification.expiresAt,
      message: 'Un nouveau code OTP a été envoyé par e-mail.',
    };
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

  private createAuthPayload(user: UserModel): AuthPayload {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      username: user.username,
    });

    return {
      accessToken,
      user,
    };
  }
}
