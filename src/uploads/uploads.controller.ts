import { BadRequestException, Controller, Logger, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { memoryStorage } from 'multer';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService, MAX_IMAGE_BYTES, MAX_POST_IMAGES, UploadedImage } from './cloudinary.service';

@Controller('uploads')
@UseGuards(AuthGuard('jwt'))
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);
  constructor(private readonly cloudinary: CloudinaryService, private readonly prisma: PrismaService) {}

  @Post('images')
  @UseInterceptors(FilesInterceptor('images', MAX_POST_IMAGES, { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_POST_IMAGES } }))
  async images(@UploadedFiles() files: UploadedImage[], @Req() req: { user: { sub: string } }) {
    if (!files?.length) throw new BadRequestException('Au moins une image est requise.');
    this.logger.log(`Authenticated image upload started (userId=${req.user.sub}, count=${files.length})`);
    const results = await Promise.all(files.map((file) => this.cloudinary.uploadImage(file)));
    const uploads = await Promise.all(results.map((result, index) => this.prisma.upload.create({ data: {
      userId: req.user.sub, fileName: files[index].originalname, fileType: files[index].mimetype,
      fileSize: BigInt(files[index].size), storagePath: result.url, status: 'AVAILABLE', sourceType: 'POST',
    }, select: { id: true, storagePath: true } })));
    await this.prisma.auditLog.create({ data: { actorId: req.user.sub, action: 'FILES_UPLOADED', entityType: 'upload', metadata: { uploadIds: uploads.map(({ id }) => id), count: uploads.length } } });
    this.logger.log(`Image upload metadata saved (userId=${req.user.sub}, count=${uploads.length})`);
    return uploads;
  }
}
