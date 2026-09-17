import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY } from '../auth/rate-limit.decorator';
import { TranscriptionsController } from './transcriptions.controller';

describe('TranscriptionsController', () => {
  const reflector = new Reflector();

  it('does not rate-limit transcription creation requests', () => {
    const policies = reflector.getAllAndOverride(RATE_LIMIT_KEY, [
      TranscriptionsController.prototype.create,
      TranscriptionsController,
    ]);

    expect(policies).toBeUndefined();
  });

  it('does not rate-limit transcription retry requests', () => {
    const policies = reflector.getAllAndOverride(RATE_LIMIT_KEY, [
      TranscriptionsController.prototype.retry,
      TranscriptionsController,
    ]);

    expect(policies).toBeUndefined();
  });
});
