import { Logger } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';
import { UploadCleanupService } from './upload-cleanup.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UploadCleanupService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('handles a scheduled cleanup rejection without an unhandled rejection', async () => {
    jest.useFakeTimers();
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const findMany = jest
      .fn()
      .mockRejectedValue(new Error('database mismatch'));
    const service = new UploadCleanupService(
      { upload: { findMany } } as unknown as PrismaService,
      {} as CloudinaryService,
    );

    service.onModuleInit();
    jest.advanceTimersByTime(5 * 60 * 1000);
    await Promise.resolve();
    await Promise.resolve();
    service.onModuleDestroy();

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith(
      'Scheduled upload cleanup failed: database mismatch',
    );
  });
});
