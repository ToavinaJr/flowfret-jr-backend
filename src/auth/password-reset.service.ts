import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { errorDetails } from '../common/debug';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PASSWORD_RESET_TTL_MINUTES } from './auth.constants';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  normalizeEmail,
} from './auth.utils';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async request(rawEmail: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalizeEmail(rawEmail), mode: 'insensitive' },
      },
    });
    if (!user || !user.passwordHash) return;
    const token = generateOpaqueToken();
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
    );
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashOpaqueToken(token), expiresAt },
      }),
    ]);
    const appUrl =
      this.configService.get<string>('APP_URL') ?? 'http://localhost:5173';
    try {
      await this.mailService.sendPasswordResetEmail({
        to: user.email,
        username: user.username,
        resetLink: `${appUrl.replace(/\/$/, '')}/reset-password?token=${token}`,
        expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
      });
    } catch (error) {
      this.logger.error(
        `Unable to send password reset email for user ${user.id}`,
        errorDetails(error),
      );
    }
  }

  async reset(token: string, password: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now())
      throw new BadRequestException('Invalid or expired password reset link.');
    const usedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await bcrypt.hash(password, 10) },
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
}
