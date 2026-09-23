import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from './cloudinary.service';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class UploadCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UploadCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.processPending().catch((error: unknown) => {
        this.logger.error(
          `Scheduled upload cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      });
    }, CLEANUP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async processPending(uploadIds?: string[]): Promise<void> {
    const uploads = await this.prisma.upload.findMany({
      where: {
        cleanupPending: true,
        isDeleted: true,
        ...(uploadIds ? { id: { in: uploadIds } } : {}),
      },
      select: { id: true, storagePath: true, storagePublicId: true },
      take: uploadIds ? undefined : 25,
    });

    for (const upload of uploads) {
      const publicId =
        upload.storagePublicId ?? this.publicIdFromUrl(upload.storagePath);
      if (!publicId) {
        this.logger.error(
          `Cloudinary public id unavailable for upload ${upload.id}`,
        );
        continue;
      }
      try {
        await this.cloudinary.deleteImage(publicId);
        await this.prisma.upload.updateMany({
          where: { id: upload.id, cleanupPending: true },
          data: { cleanupPending: false },
        });
      } catch (error) {
        this.logger.error(
          `Deferred Cloudinary cleanup failed for upload ${upload.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }

  private publicIdFromUrl(storagePath: string): string | null {
    try {
      const url = new URL(storagePath);
      if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com')
        return null;
      const marker = '/image/upload/';
      const markerIndex = url.pathname.indexOf(marker);
      if (markerIndex < 0) return null;
      const segments = url.pathname
        .slice(markerIndex + marker.length)
        .split('/')
        .filter(Boolean);
      if (/^v\d+$/.test(segments[0] ?? '')) segments.shift();
      if (!segments.length) return null;
      const encoded = segments.join('/').replace(/\.[^./]+$/, '');
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }
}
