import { SocketEventLimiter } from './socket-event-limiter';

describe('SocketEventLimiter', () => {
  it('allows up to the limit then blocks within the same window', () => {
    const limiter = new SocketEventLimiter(2, 1000);

    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 10)).toBe(true);
    expect(limiter.allow('a', 20)).toBe(false);
  });

  it('keeps budgets independent per socket', () => {
    const limiter = new SocketEventLimiter(1, 1000);

    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('b', 0)).toBe(true);
    expect(limiter.allow('a', 1)).toBe(false);
  });

  it('starts a new window once the previous one elapsed', () => {
    const limiter = new SocketEventLimiter(1, 1000);

    limiter.allow('a', 0);
    expect(limiter.allow('a', 500)).toBe(false);
    expect(limiter.allow('a', 1000)).toBe(true);
  });

  it('forgets a socket on demand', () => {
    const limiter = new SocketEventLimiter(1, 1000);

    limiter.allow('a', 0);
    limiter.forget('a');

    expect(limiter.allow('a', 1)).toBe(true);
  });
});
