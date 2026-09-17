import { CallHandler, ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Subject } from 'rxjs';
import { ConcurrentUploadsInterceptor } from './concurrent-uploads.interceptor';

function contextFor(userId?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: userId ? { sub: userId } : undefined }),
    }),
  } as ExecutionContext;
}

describe('ConcurrentUploadsInterceptor', () => {
  it('rejects unauthenticated upload requests', () => {
    const interceptor = new ConcurrentUploadsInterceptor({
      get: () => undefined,
    } as unknown as ConfigService);

    expect(() =>
      interceptor.intercept(contextFor(), {
        handle: () => new Subject(),
      }),
    ).toThrow(HttpException);
  });

  it('enforces the per-user limit and releases the slot on completion', () => {
    const interceptor = new ConcurrentUploadsInterceptor({
      get: (key: string) => (key === 'UPLOAD_MAX_CONCURRENT_PER_USER' ? 1 : 4),
    } as unknown as ConfigService);
    const activeUpload = new Subject<void>();
    const handler: CallHandler = { handle: () => activeUpload };
    interceptor.intercept(contextFor('user-1'), handler).subscribe();

    expect(() => interceptor.intercept(contextFor('user-1'), handler)).toThrow(
      HttpException,
    );

    activeUpload.complete();
    expect(() =>
      interceptor.intercept(contextFor('user-1'), {
        handle: () => new Subject<void>(),
      }),
    ).not.toThrow();
  });

  it('enforces the global upload limit across users', () => {
    const interceptor = new ConcurrentUploadsInterceptor({
      get: (key: string) => (key === 'UPLOAD_MAX_CONCURRENT_GLOBAL' ? 1 : 2),
    } as unknown as ConfigService);
    interceptor
      .intercept(contextFor('user-1'), {
        handle: () => new Subject<void>(),
      })
      .subscribe();

    expect(() =>
      interceptor.intercept(contextFor('user-2'), {
        handle: () => new Subject<void>(),
      }),
    ).toThrow(HttpException);
  });
});
