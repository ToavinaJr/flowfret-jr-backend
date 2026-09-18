export function readSpotifyErrorDetail(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;

  const body = data as Record<string, unknown>;
  const apiError = body.error;
  if (apiError && typeof apiError === 'object') {
    const error = apiError as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof error.message === 'string') parts.push(error.message);
    if (typeof error.reason === 'string') parts.push(`reason=${error.reason}`);
    if (parts.length > 0) return parts.join(', ');
  }

  if (typeof body.error === 'string') {
    const parts = [body.error];
    if (typeof body.error_description === 'string')
      parts.push(body.error_description);
    return parts.join(': ');
  }
  return undefined;
}

export function readRetryAfterHeader(headers: unknown): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const value = (headers as Record<string, unknown>)['retry-after'];
  return typeof value === 'string' ? value : undefined;
}