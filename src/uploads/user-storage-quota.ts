import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApplicationException } from '../common/application-exception';

type UploadTransaction = Pick<Prisma.TransactionClient, '$queryRaw' | 'upload'>;

/** Serializes quota checks and metadata inserts for a user within a transaction. */
export async function assertUserStorageQuota(
  tx: UploadTransaction,
  userId: string,
  incomingBytes: number,
  quotaBytes: number,
): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(42, hashtext(${userId}))`;
  const currentUsage = await tx.upload.aggregate({
    where: { userId, isDeleted: false },
    _sum: { fileSize: true },
  });
  if (
    (currentUsage._sum.fileSize ?? 0n) + BigInt(incomingBytes) >
    BigInt(quotaBytes)
  )
    throw new ApplicationException(
      'UPLOAD_QUOTA_EXCEEDED',
      'The storage quota has been reached.',
      HttpStatus.BAD_REQUEST,
    );
}
