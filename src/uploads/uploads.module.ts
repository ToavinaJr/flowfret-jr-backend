import { Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';
import { UploadsController } from './uploads.controller';
import { ConcurrentUploadsInterceptor } from './concurrent-uploads.interceptor';
import { UploadCleanupService } from './upload-cleanup.service';
import { UploadsResolver } from './uploads.resolver';

@Module({
  controllers: [UploadsController],
  providers: [
    CloudinaryService,
    UploadCleanupService,
    ConcurrentUploadsInterceptor,
    UploadsResolver,
  ],
  exports: [UploadCleanupService, CloudinaryService],
})
export class UploadsModule {}
