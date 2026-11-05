import { AuthResolver } from './auth.resolver';
import { RATE_LIMIT_KEY } from './rate-limit.decorator';

describe('AuthResolver security metadata', () => {
  it('rate limits unauthenticated logout requests', () => {
    const logoutHandler = Object.getOwnPropertyDescriptor(
      AuthResolver.prototype,
      'logout',
    )?.value as unknown as object;

    expect(Reflect.getMetadata(RATE_LIMIT_KEY, logoutHandler)).toEqual([
      { limit: 20, windowSeconds: 900, failClosed: true },
    ]);
  });
});
