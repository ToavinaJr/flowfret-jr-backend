/**
 * Fixed-window limiter for client-initiated socket events, keyed per socket.
 * Each `chat:join` costs a database membership check, so a connected client must not be able to
 * repeat it without bound. State is per process, which matches the per-process socket connections.
 */
export class SocketEventLimiter {
  private readonly windows = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Returns false once the socket exceeded its budget for the current window. */
  allow(socketId: string, now: number = Date.now()): boolean {
    const current = this.windows.get(socketId);
    if (!current || now >= current.resetAt) {
      this.windows.set(socketId, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    current.count += 1;
    return current.count <= this.limit;
  }

  forget(socketId: string): void {
    this.windows.delete(socketId);
  }
}
