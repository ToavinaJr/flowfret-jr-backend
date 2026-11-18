import { Prisma } from '@prisma/client';
import { assertUserStorageQuota } from './user-storage-quota';

describe('assertUserStorageQuota', () => {
  it('locks the user before reading usage and allows uploads within quota', async () => {
    const txMocks = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      upload: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { fileSize: 8n } }),
      },
    };
    const tx = txMocks as unknown as Prisma.TransactionClient;

    await expect(
      assertUserStorageQuota(tx, 'user-1', 2, 10),
    ).resolves.toBeUndefined();

    expect(txMocks.$queryRaw).toHaveBeenCalled();
    expect(txMocks.upload.aggregate).toHaveBeenCalledWith({
      where: { userId: 'user-1', isDeleted: false },
      _sum: { fileSize: true },
    });
    expect(txMocks.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      txMocks.upload.aggregate.mock.invocationCallOrder[0],
    );
  });

  it('rejects a reservation that would exceed the quota', async () => {
    const txMocks = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      upload: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { fileSize: 9n } }),
      },
    };
    const tx = txMocks as unknown as Prisma.TransactionClient;

    await expect(assertUserStorageQuota(tx, 'user-1', 2, 10)).rejects.toThrow(
      'The storage quota has been reached.',
    );
  });
});
