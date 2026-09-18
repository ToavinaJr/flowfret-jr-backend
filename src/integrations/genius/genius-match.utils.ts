import { HttpException, HttpStatus } from '@nestjs/common';
import { AxiosError } from 'axios';

export function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.85;
  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

export function describeError(error: unknown): string {
  if (error instanceof HttpException) {
    const status = Number(error.getStatus());
    if (status === Number(HttpStatus.UNAUTHORIZED)) return 'unauthorized';
    if (status === Number(HttpStatus.TOO_MANY_REQUESTS)) return 'rate limited';
  }
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    if (status === 401) return 'unauthorized';
    if (status === 429) return 'rate limited';
    return `http ${status ?? 'network'}`;
  }
  return 'unknown error';
}