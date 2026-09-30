import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { User, UserStatus } from '@prisma/client';
import { randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { GENERIC_GOOGLE_ERROR } from './auth.constants';
import { GoogleProfileService } from './google-profile.service';
import { isUniqueConstraintError, normalizeEmail } from './auth.utils';

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: GoogleProfileService,
  ) {}

  async login(accessToken: string): Promise<User> {
    const profile = await this.verifiedProfile(accessToken);
    let user = await this.prisma.user.findFirst({
      where: { googleId: profile.sub, googleSignupCompleted: true },
    });
    if (
      !user ||
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.DELETED
    ) {
      this.logger.warn(
        JSON.stringify({
          event: 'google_login.rejected',
          reason: 'account_unavailable',
        }),
      );
      throw new UnauthorizedException(GENERIC_GOOGLE_ERROR);
    }
    user = await this.prisma.user.update({
      where: { id: user.id },
      data: { status: UserStatus.ACTIVE, lastLoginAt: new Date() },
    });
    return user;
  }

  async register(accessToken: string): Promise<User> {
    const profile = await this.verifiedProfile(accessToken);
    const email = normalizeEmail(profile.email);
    const googleId = profile.sub;
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
      include: { profile: true },
    });
    if (existing?.googleId === googleId && !existing.isDeleted) {
      if (
        existing.status === UserStatus.SUSPENDED ||
        existing.status === UserStatus.DELETED
      ) {
        this.logger.warn(
          JSON.stringify({
            event: 'google_registration.rejected',
            reason: 'account_unavailable',
          }),
        );
        throw new ConflictException(GENERIC_GOOGLE_ERROR);
      }

      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          googleSignupCompleted: true,
          status: UserStatus.ACTIVE,
          lastLoginAt: new Date(),
          profile: existing.profile
            ? undefined
            : {
                create: {
                  displayName: profile.name ?? existing.username,
                  avatarUrl: profile.picture ?? null,
                },
              },
        },
        include: { profile: true },
      });
    }
    if (existing) {
      this.logger.warn(
        JSON.stringify({
          event: 'google_registration.rejected',
          reason: 'identifier_unavailable',
        }),
      );
      throw new ConflictException(GENERIC_GOOGLE_ERROR);
    }
    const username = await this.allocateUsername(
      profile.name ?? profile.given_name ?? email.split('@')[0],
    );
    try {
      return await this.prisma.user.create({
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
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw new ConflictException(GENERIC_GOOGLE_ERROR);
      throw error;
    }
  }

  private async verifiedProfile(accessToken: string) {
    const profile = await this.profiles.fetch(accessToken);
    const verified =
      profile.email_verified === true || profile.email_verified === 'true';
    if (!profile.email || !verified)
      throw new UnauthorizedException(GENERIC_GOOGLE_ERROR);
    return profile;
  }

  private async allocateUsername(seed: string): Promise<string> {
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
      if (!exists) return candidate.slice(0, 50);
    }
    return `user_${randomBytes(6).toString('hex')}`.slice(0, 50);
  }
}
