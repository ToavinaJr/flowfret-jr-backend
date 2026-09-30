import { BadRequestException } from '@nestjs/common';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const CURSOR_VERSION = 1;

type CursorPayload = { v: number; offset: number };

export interface AdminPageRequest {
  first?: number;
  after?: string;
}

export interface AdminPageWindow {
  skip: number;
  take: number;
}

export interface AdminPageResult<T> {
  nodes: T[];
  totalCount: number;
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    endCursor: string | null;
  };
}

export function adminCreatedAtRange(from?: string, to?: string) {
  const start = from
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00.000Z` : from)
    : undefined;
  const end = to
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to)
    : undefined;
  return start || end
    ? { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) }
    : undefined;
}

export function decodeAdminPage(input?: AdminPageRequest): AdminPageWindow {
  const take = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(input?.first ?? DEFAULT_PAGE_SIZE)),
  );
  if (!input?.after) return { skip: 0, take };
  try {
    const payload = JSON.parse(
      Buffer.from(input.after, 'base64url').toString('utf8'),
    ) as CursorPayload;
    if (
      payload.v !== CURSOR_VERSION ||
      !Number.isSafeInteger(payload.offset) ||
      payload.offset < 0
    ) {
      throw new Error('Invalid cursor payload');
    }
    return { skip: payload.offset, take };
  } catch {
    throw new BadRequestException('Curseur administrateur invalide.');
  }
}

export function buildAdminPage<T>(
  rows: T[],
  totalCount: number,
  window: AdminPageWindow,
): AdminPageResult<T> {
  const nodes = rows.slice(0, window.take);
  const nextOffset = window.skip + nodes.length;
  const hasNextPage = rows.length > window.take || nextOffset < totalCount;
  return {
    nodes,
    totalCount,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: window.skip > 0,
      endCursor:
        nodes.length > 0
          ? Buffer.from(
              JSON.stringify({ v: CURSOR_VERSION, offset: nextOffset }),
            ).toString('base64url')
          : null,
    },
  };
}
