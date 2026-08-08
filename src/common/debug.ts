export function isDebugEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    (process.env.DEBUG ?? '').trim().toLowerCase(),
  );
}

export function errorDetails(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return typeof error === 'string' ? error : JSON.stringify(error);
}
