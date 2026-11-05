import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY } from '../auth/rate-limit.decorator';
import type { RateLimitOptions } from '../auth/rate-limit.decorator';
import { TranscriptionsController } from './transcriptions.controller';

describe('TranscriptionsController', () => {
  const reflector = new Reflector();

  it('rate limits expensive transcription creation by IP and user', () => {
    const policies = reflector.getAllAndOverride<RateLimitOptions[]>(
      RATE_LIMIT_KEY,
      [
        // Metadata belongs to the prototype method; the test never invokes it.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        TranscriptionsController.prototype.create,
        TranscriptionsController,
      ],
    );

    expect(policies).toEqual([
      { limit: 10, windowSeconds: 60, failClosed: true, identity: 'ip' },
      { limit: 80, windowSeconds: 3600, failClosed: true, identity: 'ip' },
      { limit: 5, windowSeconds: 60, failClosed: true, identity: 'user' },
      { limit: 40, windowSeconds: 3600, failClosed: true, identity: 'user' },
    ]);
  });

  it('applies a tighter rate limit to transcription retries', () => {
    const policies = reflector.getAllAndOverride<RateLimitOptions[]>(
      RATE_LIMIT_KEY,
      [
        // Metadata belongs to the prototype method; the test never invokes it.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        TranscriptionsController.prototype.retry,
        TranscriptionsController,
      ],
    );

    expect(policies).toEqual([
      { limit: 10, windowSeconds: 60, failClosed: true, identity: 'ip' },
      { limit: 40, windowSeconds: 3600, failClosed: true, identity: 'ip' },
      { limit: 5, windowSeconds: 60, failClosed: true, identity: 'user' },
      { limit: 20, windowSeconds: 3600, failClosed: true, identity: 'user' },
    ]);
  });
});
