import { BadRequestException } from '@nestjs/common';
import { buildAdminPage, decodeAdminPage } from './admin-pagination';

describe('admin cursor pagination', () => {
  it('uses safe defaults and caps the requested page size', () => {
    expect(decodeAdminPage()).toEqual({ skip: 0, take: 25 });
    expect(decodeAdminPage({ first: 999 })).toEqual({ skip: 0, take: 100 });
  });

  it('creates an opaque cursor that resumes after the current page', () => {
    const firstPage = buildAdminPage([1, 2, 3], 5, { skip: 0, take: 2 });
    expect(firstPage.nodes).toEqual([1, 2]);
    expect(firstPage.pageInfo.hasNextPage).toBe(true);
    expect(
      decodeAdminPage({ first: 2, after: firstPage.pageInfo.endCursor! }),
    ).toEqual({ skip: 2, take: 2 });
  });

  it('rejects malformed or tampered cursors', () => {
    expect(() => decodeAdminPage({ after: 'invalid' })).toThrow(
      BadRequestException,
    );
    const negative = Buffer.from(JSON.stringify({ v: 1, offset: -1 })).toString(
      'base64url',
    );
    expect(() => decodeAdminPage({ after: negative })).toThrow(
      BadRequestException,
    );
  });
});
