import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { TOKEN_BYTES } from './auth.constants';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

export function generateOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
