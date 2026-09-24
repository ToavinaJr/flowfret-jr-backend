import type { YouTubeThumbnail } from './youtube.types';

export function parseYouTubeDuration(value?: string): number {
  if (!value) return 0;
  const match = value.match(
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/,
  );
  if (!match) return 0;
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
  return (
    (Number(days) * 86400 +
      Number(hours) * 3600 +
      Number(minutes) * 60 +
      Number(seconds)) *
    1000
  );
}

export function pickYouTubeThumbnail(
  thumbnails: Record<string, YouTubeThumbnail | undefined>,
): YouTubeThumbnail | undefined {
  return (
    thumbnails.maxres ??
    thumbnails.standard ??
    thumbnails.high ??
    thumbnails.medium ??
    thumbnails.default
  );
}

export function decodeYouTubeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"',
  };
  return value.replace(
    /&(#x?[0-9a-f]+|[a-z]+);/gi,
    (entity: string, code: string) => {
      if (!code.startsWith('#')) return named[code.toLowerCase()] ?? entity;
      const hexadecimal = code[1]?.toLowerCase() === 'x';
      const parsed = Number.parseInt(
        code.slice(hexadecimal ? 2 : 1),
        hexadecimal ? 16 : 10,
      );
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
    },
  );
}

export function readYouTubeErrorReason(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const error = (data as Record<string, unknown>).error;
  if (!error || typeof error !== 'object') return undefined;
  const errors = (error as Record<string, unknown>).errors;
  if (!Array.isArray(errors)) return undefined;
  const first: unknown = errors[0];
  if (!first || typeof first !== 'object') return undefined;
  const reason = (first as Record<string, unknown>).reason;
  return typeof reason === 'string' ? reason : undefined;
}
