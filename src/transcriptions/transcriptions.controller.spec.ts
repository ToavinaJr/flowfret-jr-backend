import { Reflector } from '@nestjs/core';
import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from '../auth/rate-limit.decorator';
import { TranscriptionsController } from './transcriptions.controller';

describe('TranscriptionsController', () => {
  const reflector = new Reflector();

  it('rate-limits transcription creation requests per minute and per day', () => {
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
      { limit: 5, windowSeconds: 60, failClosed: true },
      { limit: 20, windowSeconds: 86_400, failClosed: true },
    ]);
  });

  it('rate-limits transcription retries per hour and per day', () => {
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
      { limit: 3, windowSeconds: 3600, failClosed: true },
      { limit: 5, windowSeconds: 86_400, failClosed: true },
    ]);
  });
});
