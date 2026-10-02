import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY } from '../auth/rate-limit.decorator';
import { TranscriptionsController } from './transcriptions.controller';

describe('TranscriptionsController', () => {
  const reflector = new Reflector();

  it('does not apply request rate limits to transcription creation', () => {
    const policies = reflector.getAllAndOverride<unknown[]>(
      RATE_LIMIT_KEY,
      [
        // Metadata belongs to the prototype method; the test never invokes it.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        TranscriptionsController.prototype.create,
        TranscriptionsController,
      ],
    );

    expect(policies).toBeUndefined();
  });

  it('does not apply request rate limits to transcription retries', () => {
    const policies = reflector.getAllAndOverride<unknown[]>(
      RATE_LIMIT_KEY,
      [
        // Metadata belongs to the prototype method; the test never invokes it.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        TranscriptionsController.prototype.retry,
        TranscriptionsController,
      ],
    );

    expect(policies).toBeUndefined();
  });
});
