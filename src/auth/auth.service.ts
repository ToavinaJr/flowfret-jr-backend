import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  GoogleAuthInput,
  LoginInput,
  RegisterInput,
  RegisterPendingPayload,
  VerifyEmailInput,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  GENERIC_CREDENTIALS_ERROR,
  GENERIC_REGISTRATION_ERROR,
} from './auth.constants';
import { AuthSessionPayload, AuthSessionService } from './auth-session.service';
import { EmailVerificationService } from './email-verification.service';
import { GoogleAuthService } from './google-auth.service';
import { PasswordResetService } from './password-reset.service';
import { isUniqueConstraintError, normalizeEmail } from './auth.utils';

export type { AuthSessionPayload } from './auth-session.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: AuthSessionService,
    private readonly verification: EmailVerificationService,
    private readonly passwordReset: PasswordResetService,
    private readonly googleAuth: GoogleAuthService,
  ) {}

  async register(input: RegisterInput): Promise<AuthSessionPayload> {
    const email = normalizeEmail(input.email);
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: email, mode: 'insensitive' } },
          { username: input.username },
        ],
      },
    });
    if (existing) {
      this.logger.warn(
        JSON.stringify({
          event: 'registration.rejected',
          reason: 'identifier_unavailable',
        }),
      );
      throw new ConflictException(GENERIC_REGISTRATION_ERROR);
    }
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          username: input.username,
          passwordHash: await bcrypt.hash(input.password, 10),
          status: UserStatus.ACTIVE,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw new ConflictException(GENERIC_REGISTRATION_ERROR);
      throw error;
    }
    return this.sessions.create(user);
  }

  async login(input: LoginInput): Promise<AuthSessionPayload> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(input.email) },
    });
    if (!user?.passwordHash)
      throw new UnauthorizedException(GENERIC_CREDENTIALS_ERROR);
    if (!(await bcrypt.compare(input.password, user.passwordHash)))
      throw new UnauthorizedException(GENERIC_CREDENTIALS_ERROR);
    if (
      user.status !== UserStatus.ACTIVE &&
      user.status !== UserStatus.PENDING
    ) {
      this.logger.warn(
        JSON.stringify({
          event: 'login.rejected',
          reason: 'account_unavailable',
        }),
      );
      throw new UnauthorizedException(GENERIC_CREDENTIALS_ERROR);
    }
    const authenticatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(user.status === UserStatus.PENDING
          ? { status: UserStatus.ACTIVE }
          : {}),
      },
    });
    return this.sessions.create(authenticatedUser);
  }

  async loginWithGoogle(input: GoogleAuthInput): Promise<AuthSessionPayload> {
    return this.sessions.create(await this.googleAuth.login(input.accessToken));
  }

  async registerWithGoogle(
    input: GoogleAuthInput,
  ): Promise<AuthSessionPayload> {
    return this.sessions.create(
      await this.googleAuth.register(input.accessToken),
    );
  }

  async verifyEmail(input: VerifyEmailInput): Promise<AuthSessionPayload> {
    return this.sessions.create(await this.verification.verify(input));
  }

  resendVerificationEmail(token: string): Promise<RegisterPendingPayload> {
    return this.verification.resend(token);
  }

  requestPasswordReset(email: string): Promise<void> {
    return this.passwordReset.request(email);
  }

  resetPassword(token: string, password: string): Promise<void> {
    return this.passwordReset.reset(token, password);
  }

  refreshSession(refreshToken: string): Promise<AuthSessionPayload> {
    return this.sessions.refresh(refreshToken);
  }

  logout(refreshToken: string): Promise<void> {
    return this.sessions.logout(refreshToken);
  }
}
