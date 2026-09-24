import { BadRequestException } from '@nestjs/common';
import {
  decodeMusicCursor,
  encodeMusicCursor,
  parseMusicOffset,
} from './music-search-cursor';

describe('music search cursor', () => {
  it('round-trips an opaque provider cursor', () => {
    const cursor = encodeMusicCursor('YOUTUBE', 'next-page-token');

    expect(cursor).not.toContain('next-page-token');
    expect(decodeMusicCursor(cursor ?? undefined, 'YOUTUBE')).toBe(
      'next-page-token',
    );
  });

  it('rejects a cursor created for another provider', () => {
    const cursor = encodeMusicCursor('SPOTIFY', '10');

    expect(() => decodeMusicCursor(cursor ?? undefined, 'YOUTUBE')).toThrow(
      BadRequestException,
    );
  });

  it('accepts only safe non-negative offsets', () => {
    expect(parseMusicOffset('20')).toBe(20);
    expect(() => parseMusicOffset('-1')).toThrow(BadRequestException);
    expect(() => parseMusicOffset('not-a-number')).toThrow(BadRequestException);
  });
});
