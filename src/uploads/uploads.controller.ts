import {
  BadRequestException,
  Controller,
  Logger,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { memoryStorage } from 'multer';
import { PrismaService } from '../prisma/prisma.service';
import {
  CloudinaryService,
  MAX_IMAGE_BYTES,
  MAX_POST_IMAGES,
  UploadedImage,
} from './cloudinary.service';
import { RateLimits } from '../auth/rate-limit.decorator';
import { ConcurrentUploadsInterceptor } from './concurrent-uploads.interceptor';
import { ConfigService } from '@nestjs/config';

@Controller('uploads')
@UseGuards(AuthGuard('jwt'))
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);
  constructor(
    private readonly cloudinary: CloudinaryService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Post('images')
  @RateLimits(
    { limit: 5, windowSeconds: 60, failClosed: true },
    { limit: 30, windowSeconds: 3600, failClosed: true },
  )
  @UseInterceptors(
    ConcurrentUploadsInterceptor,
    FilesInterceptor('images', MAX_POST_IMAGES, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_POST_IMAGES },
    }),
  )
  async images(
    @UploadedFiles() files: UploadedImage[],
    @Req() req: { user: { sub: string } },
  ) {
    if (!files?.length)
      throw new BadRequestException('Au moins une image est requise.');
    const incomingBytes = files.reduce((total, file) => total + file.size, 0);
    const used = await this.prisma.upload.aggregate({
      where: { userId: req.user.sub, isDeleted: false },
      _sum: { fileSize: true },
    });
    const quota = BigInt(this.storageQuotaBytes());
    if ((used._sum.fileSize ?? 0n) + BigInt(incomingBytes) > quota) {
      throw new BadRequestException(
        'Quota de stockage atteint. Supprimez des fichiers avant de continuer.',
      );
    }
    this.logger.log(
      `Authenticated image upload started (userId=${req.user.sub}, count=${files.length})`,
    );
    const settled = await Promise.allSettled(
      files.map((file) => this.cloudinary.uploadImage(file)),
    );
    const uploaded = settled
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<{
          url: string;
          publicId: string;
        }> => result.status === 'fulfilled',
      )
      .map((result) => result.value);
    const failed = settled.find((result) => result.status === 'rejected');
    if (failed) {
      await this.cleanupImages(uploaded);
      throw failed.reason;
    }
    try {
      const uploads = await this.prisma.$transaction(async (tx) => {
        const records = await Promise.all(
          uploaded.map((result, index) =>
            tx.upload.create({
              data: {
                userId: req.user.sub,
                fileName: files[index].originalname,
                fileType: files[index].mimetype,
                fileSize: BigInt(files[index].size),
                storagePath: result.url,
                storagePublicId: result.publicId,
                status: 'AVAILABLE',
                sourceType: 'POST',
              },
              select: { id: true, storagePath: true },
            }),
          ),
        );
        await tx.auditLog.create({
          data: {
            actorId: req.user.sub,
            action: 'FILES_UPLOADED',
            entityType: 'upload',
            metadata: {
              uploadIds: records.map(({ id }) => id),
              count: records.length,
            },
          },
        });
        return records;
      });
      this.logger.log(
        `Image upload metadata saved (userId=${req.user.sub}, count=${uploads.length})`,
      );
      return uploads;
    } catch (error) {
      await this.cleanupImages(uploaded);
      throw error;
    }
  }

  private async cleanupImages(
    images: Array<{ publicId: string }>,
  ): Promise<void> {
    const cleanup = await Promise.allSettled(
      images.map(({ publicId }) => this.cloudinary.deleteImage(publicId)),
    );
    cleanup.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Unable to rollback Cloudinary image ${images[index].publicId}: ${String(result.reason)}`,
        );
      }
    });
  }

  private storageQuotaBytes(): number {
    const configured = Number(
      this.config.get('UPLOAD_MAX_STORAGE_BYTES_PER_USER'),
    );
    return Number.isSafeInteger(configured) && configured > 0
      ? configured
      : 250 * 1024 * 1024;
  }
}
