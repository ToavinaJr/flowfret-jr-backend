import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const executionContext = {
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  afterEach(() => jest.restoreAllMocks());

  function createGuard(requiredRoles?: UserRole[]) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  function mockRequest(role?: UserRole) {
    jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getContext: () => ({ req: { user: role ? { role } : undefined } }),
    } as unknown as GqlExecutionContext);
  }

  it('allows operations without a role requirement', () => {
    expect(createGuard().canActivate(executionContext)).toBe(true);
  });

  it('allows an administrator on an admin operation', () => {
    mockRequest(UserRole.ADMIN);
    expect(createGuard([UserRole.ADMIN]).canActivate(executionContext)).toBe(true);
  });

  it('rejects a regular user on an admin operation', () => {
    mockRequest(UserRole.USER);
    expect(createGuard([UserRole.ADMIN]).canActivate(executionContext)).toBe(false);
  });

  it('rejects a request without an authenticated role', () => {
    mockRequest();
    expect(createGuard([UserRole.ADMIN]).canActivate(executionContext)).toBe(false);
  });
});
