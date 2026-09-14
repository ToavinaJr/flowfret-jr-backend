import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { GqlJwtAuthGuard } from './gql-jwt-auth.guard';

describe('GqlJwtAuthGuard request extraction', () => {
  const guard = new GqlJwtAuthGuard({} as Reflector);

  afterEach(() => jest.restoreAllMocks());

  it('returns the native request for REST controllers', () => {
    const request = { headers: { authorization: 'Bearer token' } };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(guard.getRequest(context)).toBe(request);
  });

  it('returns req from the GraphQL context for resolvers', () => {
    const request = { headers: { authorization: 'Bearer token' } };
    jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getContext: () => ({ req: request }),
    } as unknown as GqlExecutionContext);
    const context = { getType: () => 'graphql' } as unknown as ExecutionContext;

    expect(guard.getRequest(context)).toBe(request);
  });
});
