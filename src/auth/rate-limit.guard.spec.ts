import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RateLimitGuard } from './rate-limit.guard';

type RedisStub = {
  status: string;
  eval: jest.Mock<Promise<number>, unknown[]>;
  quit: jest.Mock;
};

type GuardStub = {
  canActivate: (context: ExecutionContext) => Promise<boolean>;
};

function createGuard(
  redisEval: jest.Mock<Promise<number>, unknown[]>,
  policies = [{ limit: 2, windowSeconds: 60, failClosed: true }],
): GuardStub {
  const guard = Object.create(RateLimitGuard.prototype) as GuardStub;
  Reflect.set(guard, 'reflector', {
    getAllAndOverride: jest.fn().mockReturnValue(policies),
  });
  Reflect.set(guard, 'redis', {
    status: 'ready',
    eval: redisEval,
    quit: jest.fn().mockResolvedValue(undefined),
  } satisfies RedisStub);
  Reflect.set(guard, 'logger', { error: jest.fn() });
  return guard;
}

function context() {
  return {
    getHandler: jest.fn().mockReturnValue({ name: 'limitedOperation' }),
    getClass: jest.fn().mockReturnValue({ name: 'TestResolver' }),
    getType: jest.fn().mockReturnValue('http'),
    switchToHttp: () => ({
      getRequest: () => ({ ip: '127.0.0.1', user: { sub: 'user-id', role: UserRole.USER } }),
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  it('rejects requests after the configured quota', async () => {
    const redisEval = jest
      .fn<Promise<number>, unknown[]>()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);
    const guard = createGuard(redisEval);

    await expect(guard.canActivate(context())).resolves.toBe(true);
    await expect(guard.canActivate(context())).resolves.toBe(true);
    await expect(guard.canActivate(context())).rejects.toMatchObject({
      status: 429,
    });
  });

  it('fails closed when Redis cannot evaluate the quota', async () => {
    const redisEval = jest
      .fn<Promise<number>, unknown[]>()
      .mockRejectedValue(new Error('redis unavailable'));
    const guard = createGuard(redisEval);

    const error = await guard.canActivate(context()).catch(
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(503);
  });
});
