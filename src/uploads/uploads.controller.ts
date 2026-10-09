import {
  BadRequestException,
  BadGatewayException,
  Body,
  ForbiddenException,
  NotFoundException,
  Controller,
  Logger,
  Post,
  Get,
  Param,
  Res,
  Req,
  UploadedFiles,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { memoryStorage } from 'multer';
import { PrismaService } from '../prisma/prisma.service';
import {
  CloudinaryService,
  MAX_IMAGE_BYTES,
  MAX_POST_IMAGES,
  MAX_TEACHING_FILE_BYTES,
  UploadedImage,
} from './cloudinary.service';
import { RateLimits } from '../auth/rate-limit.decorator';
import { ConcurrentUploadsInterceptor } from './concurrent-uploads.interceptor';
import { ConfigService } from '@nestjs/config';
import {
  TeachingEnrollmentStatus,
  UploadAccessType,
  UploadSourceType,
  UploadStatus,
} from '@prisma/client';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { ApplicationException } from '../common/application-exception';
import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UploadTeachingMaterialBody {
  @IsUUID('4')
  courseId!: string;

  @IsOptional()
  @IsUUID('4')
  lessonId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;
}

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
      throw new ApplicationException(
        'UPLOAD_QUOTA_EXCEEDED',
        'The storage quota has been reached.',
        HttpStatus.BAD_REQUEST,
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
      throw failed.reason instanceof ApplicationException
        ? failed.reason
        : new ApplicationException(
            'UPLOAD_FAILED',
            'Unable to upload the file.',
            HttpStatus.BAD_GATEWAY,
          );
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
                status: UploadStatus.AVAILABLE,
                sourceType: 'POST',
              },
              select: { id: true, storagePath: true },
            }),
          ),
        );
        await tx.auditLog.create({
          data: {
            actorId: req.user.sub,
            action: AUDIT_ACTION.FILES_UPLOADED,
            entityType: AUDIT_ENTITY.UPLOAD,
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

  @Post('teaching-materials')
  @RateLimits(
    { limit: 4, windowSeconds: 60, failClosed: true },
    { limit: 20, windowSeconds: 3600, failClosed: true },
  )
  @UseInterceptors(
    ConcurrentUploadsInterceptor,
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_TEACHING_FILE_BYTES },
    }),
  )
  async uploadTeachingMaterial(
    @UploadedFile() file: UploadedImage | undefined,
    @Body() body: UploadTeachingMaterialBody,
    @Req() req: { user: { sub: string } },
  ) {
    if (!file) throw new BadRequestException('Un document est requis.');
    const courseId = body.courseId?.trim();
    const title = body.title?.trim() || file.originalname;
    if (!courseId || title.length > 160)
      throw new BadRequestException('Cours ou titre invalide.');
    const course = await this.prisma.teachingCourse.findFirst({
      where: {
        id: courseId,
        isDeleted: false,
        instructor: {
          userId: req.user.sub,
          isDeleted: false,
          user: { isDeleted: false, status: 'ACTIVE' },
        },
      },
      include: { instructor: true },
    });
    if (!course)
      throw new ForbiddenException(
        'Vous devez être propriétaire du cours pour ajouter un document.',
      );
    if (body.lessonId) {
      const lesson = await this.prisma.teachingLesson.findFirst({
        where: { id: body.lessonId, courseId, status: { not: 'CANCELLED' } },
        select: { id: true },
      });
      if (!lesson)
        throw new BadRequestException(
          'La séance sélectionnée ne correspond pas à ce cours.',
        );
    }
    const quota =
      course.instructor.storageQuotaBytes > 0n
        ? course.instructor.storageQuotaBytes
        : BigInt(this.teachingQuotaBytes());
    if (
      BigInt(file.size) >
      BigInt(Math.min(MAX_TEACHING_FILE_BYTES, Number(quota)))
    )
      throw new BadRequestException(
        'La taille du document dépasse la limite de votre abonnement.',
      );
    const used = await this.prisma.upload.aggregate({
      where: {
        isDeleted: false,
        sourceType: UploadSourceType.COURSE_MATERIAL,
        teachingMaterial: {
          isDeleted: false,
          course: { instructorId: course.instructorId },
        },
      },
      _sum: { fileSize: true },
    });
    if ((used._sum.fileSize ?? 0n) + BigInt(file.size) > quota)
      throw new BadRequestException(
        'Le quota de stockage pédagogique est atteint.',
      );

    const stored = await this.cloudinary.uploadTeachingFile(file);
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const currentUsage = await tx.upload.aggregate({
            where: {
              isDeleted: false,
              sourceType: UploadSourceType.COURSE_MATERIAL,
              teachingMaterial: {
                isDeleted: false,
                course: { instructorId: course.instructorId },
              },
            },
            _sum: { fileSize: true },
          });
          if ((currentUsage._sum.fileSize ?? 0n) + BigInt(file.size) > quota)
            throw new BadRequestException(
              'Le quota de stockage pédagogique est atteint.',
            );
          const uploaded = await tx.upload.create({
            data: {
              userId: req.user.sub,
              fileName: file.originalname.slice(0, 255),
              fileType: file.mimetype,
              fileSize: BigInt(file.size),
              storagePath: stored.url,
              storagePublicId: stored.publicId,
              status: UploadStatus.AVAILABLE,
              sourceType: UploadSourceType.COURSE_MATERIAL,
              resourceType: stored.resourceType,
              accessType: UploadAccessType.AUTHENTICATED,
            },
          });
          const material = await tx.teachingMaterial.create({
            data: {
              courseId,
              lessonId: body.lessonId || null,
              uploadId: uploaded.id,
              title,
            },
          });
          await tx.auditLog.create({
            data: {
              actorId: req.user.sub,
              action: AUDIT_ACTION.FILES_UPLOADED,
              entityType: 'TEACHING_MATERIAL',
              entityId: material.id,
              metadata: {
                courseId,
                lessonId: body.lessonId || null,
                uploadId: uploaded.id,
                bytes: file.size,
              },
            },
          });
          return {
            id: material.id,
            courseId,
            lessonId: material.lessonId,
            title,
            fileName: uploaded.fileName,
            fileType: uploaded.fileType,
            fileSize: uploaded.fileSize.toString(),
            createdAt: material.createdAt,
          };
        },
        { isolationLevel: 'Serializable' },
      );
      return result;
    } catch (error) {
      await this.cloudinary
        .deleteTeachingFile(stored.publicId, stored.resourceType)
        .catch(() => undefined);
      throw error;
    }
  }

  @Get('teaching-materials/:id/content')
  async teachingMaterialContent(
    @Param('id') id: string,
    @Req() req: { user: { sub: string }; headers: { range?: string } },
    @Res() res: Response,
  ) {
    const material = await this.prisma.teachingMaterial.findFirst({
      where: {
        id,
        isDeleted: false,
        upload: { isDeleted: false, status: UploadStatus.AVAILABLE },
        course: { isDeleted: false },
      },
      include: {
        upload: true,
        course: {
          include: {
            instructor: true,
            enrollments: {
              where: {
                studentId: req.user.sub,
                status: TeachingEnrollmentStatus.ACTIVE,
                isDeleted: false,
              },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!material) throw new NotFoundException('Document introuvable.');
    if (
      material.course.instructor.userId !== req.user.sub &&
      material.course.enrollments.length === 0
    )
      throw new ForbiddenException('Accès refusé à ce document.');
    const url = this.cloudinary.authenticatedDeliveryUrl(
      material.upload.storagePath,
      material.upload.resourceType,
    );
    const upstream = await fetch(url, {
      headers: req.headers.range ? { Range: req.headers.range } : {},
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok && upstream.status !== 206) {
      const providerMessage = upstream.headers
        .get('x-cld-error')
        ?.replace(/https?:\/\/\S+/gi, '[URL redacted]')
        .slice(0, 300);
      this.logger.warn(
        `Cloudinary rejected teaching material delivery (status=${upstream.status}${providerMessage ? `, reason=${providerMessage}` : ''})`,
      );
      throw new BadGatewayException(
        'Le service de stockage ne peut pas fournir ce document pour le moment.',
      );
    }
    res.status(upstream.status);
    res.setHeader('Content-Type', material.upload.fileType);
    res.setHeader(
      'Content-Disposition',
      `${material.upload.fileType.startsWith('video/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(material.upload.fileName)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');
    for (const header of ['content-length', 'content-range']) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    if (upstream.body)
      await pipeline(upstream.body as unknown as NodeJS.ReadableStream, res);
    else res.end();
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

  private teachingQuotaBytes(): number {
    const configured = Number(
      this.config.get('TEACHING_STORAGE_DEFAULT_QUOTA_BYTES'),
    );
    return Number.isSafeInteger(configured) && configured > 0
      ? configured
      : 512 * 1024 * 1024;
  }
}
