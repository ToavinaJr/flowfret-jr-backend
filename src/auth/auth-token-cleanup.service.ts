import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthTokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthTokenCleanupService.name);
  private interval?: ReturnType<typeof setInterval>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.cleanupExpiredTokens();
    this.interval = setInterval(() => {
      void this.cleanupExpiredTokens();
    }, CLEANUP_INTERVAL_MS);
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async cleanupExpiredTokens(now = new Date()): Promise<void> {
    const retentionCutoff = new Date(now.getTime() - TOKEN_RETENTION_MS);
    try {
      const [refreshTokens, passwordResetTokens, emailVerificationTokens] =
        await Promise.all([
          this.prisma.refreshToken.deleteMany({
            where: { expiresAt: { lt: retentionCutoff } },
          }),
          this.prisma.passwordResetToken.deleteMany({
            where: {
              OR: [
                { expiresAt: { lt: retentionCutoff } },
                { usedAt: { lt: retentionCutoff } },
              ],
            },
          }),
          this.prisma.emailVerificationToken.deleteMany({
            where: {
              OR: [
                { expiresAt: { lt: retentionCutoff } },
                { usedAt: { lt: retentionCutoff } },
              ],
            },
          }),
        ]);

      const deletedCount =
        refreshTokens.count +
        passwordResetTokens.count +
        emailVerificationTokens.count;
      if (deletedCount > 0) {
        this.logger.log(
          JSON.stringify({ event: 'auth.tokens.cleaned', deletedCount }),
        );
      }
    } catch {
      this.logger.error(
        JSON.stringify({ event: 'auth.tokens.cleanup_failed' }),
      );
    }
  }
}
