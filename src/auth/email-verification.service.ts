import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { errorDetails } from '../common/debug';
import {
  RegisterPendingPayload,
  VerifyEmailInput,
} from '../graphql/graphql.types';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  GENERIC_TOKEN_ERROR,
  OTP_LENGTH,
  OTP_TTL_MINUTES,
} from './auth.constants';
import { generateOpaqueToken } from './auth.utils';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async createAndSend(user: Pick<User, 'id' | 'email' | 'username'>) {
    const otpCode = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(
      OTP_LENGTH,
      '0',
    );
    const token = generateOpaqueToken();
    const codeHash = await bcrypt.hash(otpCode, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.prisma.emailVerificationToken.create({
      data: { userId: user.id, token, codeHash, expiresAt },
    });
    const appUrl =
      this.configService.get<string>('APP_URL') ?? 'http://localhost:5173';
    try {
      await this.mailService.sendOtpVerificationEmail({
        to: user.email,
        username: user.username,
        otpCode,
        verificationLink: `${appUrl.replace(/\/$/, '')}/verify-email?token=${token}`,
        expiresInMinutes: OTP_TTL_MINUTES,
      });
    } catch (error) {
      this.logger.error(
        `Unable to send verification email for user ${user.id}`,
        errorDetails(error),
      );
    }
    return { token, expiresAt };
  }

  async verify(input: VerifyEmailInput): Promise<User> {
    const code = input.code.trim();
    if (!/^\d{4}$/.test(code))
      throw new BadRequestException('OTP must be a 4-digit code.');
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { token: input.token },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now())
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    if (!(await bcrypt.compare(code, record.codeHash)))
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    if (record.user.status === UserStatus.ACTIVE) {
      await this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      return record.user;
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
        where: { userId: record.userId, usedAt: null, id: { not: record.id } },
        data: { usedAt: new Date() },
      }),
    ]);
    return user;
  }

  async resend(token: string): Promise<RegisterPendingPayload> {
    const existing = await this.prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!existing || existing.user.status === UserStatus.ACTIVE)
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    const verification = await this.createAndSend(existing.user);
    return {
      email: existing.user.email,
      verificationToken: verification.token,
      expiresAt: verification.expiresAt,
      message: 'Un nouveau code OTP a été envoyé par e-mail.',
    };
  }
}
