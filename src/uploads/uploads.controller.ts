import { BadRequestException, Controller, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { memoryStorage } from 'multer';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService, MAX_IMAGE_BYTES, MAX_POST_IMAGES, UploadedImage } from './cloudinary.service';

@Controller('uploads')
@UseGuards(AuthGuard('jwt'))
export class UploadsController {
  constructor(private readonly cloudinary: CloudinaryService, private readonly prisma: PrismaService) {}

  @Post('images')
  @UseInterceptors(FilesInterceptor('images', MAX_POST_IMAGES, { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_POST_IMAGES } }))
  async images(@UploadedFiles() files: UploadedImage[], @Req() req: { user: { sub: string } }) {
    if (!files?.length) throw new BadRequestException('Au moins une image est requise.');
    const results = await Promise.all(files.map((file) => this.cloudinary.uploadImage(file)));
    return Promise.all(results.map((result, index) => this.prisma.upload.create({ data: {
      userId: req.user.sub, fileName: files[index].originalname, fileType: files[index].mimetype,
      fileSize: BigInt(files[index].size), storagePath: result.url, status: 'AVAILABLE', sourceType: 'POST',
    }, select: { id: true, storagePath: true } })));
  }
}
