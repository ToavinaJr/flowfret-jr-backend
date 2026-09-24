import { BadRequestException } from '@nestjs/common';
import type { MusicProvider } from './music.service';

interface CursorPayload {
  provider: MusicProvider;
  value: string;
}

export function encodeMusicCursor(
  provider: MusicProvider,
  value: string | null,
): string | null {
  if (!value) return null;
  return Buffer.from(JSON.stringify({ provider, value }), 'utf8').toString(
    'base64url',
  );
}

export function decodeMusicCursor(
  cursor: string | undefined,
  expectedProvider: MusicProvider,
): string | undefined {
  if (!cursor) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<CursorPayload>;
    if (
      payload.provider !== expectedProvider ||
      typeof payload.value !== 'string' ||
      payload.value.length === 0 ||
      payload.value.length > 500
    )
      throw new Error('Invalid cursor payload');
    return payload.value;
  } catch {
    throw new BadRequestException({
      code: 'MUSIC_CURSOR_INVALID',
      message: 'The music search cursor is invalid.',
    });
  }
}

export function parseMusicOffset(value: string | undefined): number {
  if (value === undefined) return 0;
  const offset = Number(value);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000)
    throw new BadRequestException({
      code: 'MUSIC_CURSOR_INVALID',
      message: 'The music search cursor is invalid.',
    });
  return offset;
}
