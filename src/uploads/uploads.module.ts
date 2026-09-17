import { Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';
import { UploadsController } from './uploads.controller';
import { ConcurrentUploadsInterceptor } from './concurrent-uploads.interceptor';

@Module({
  controllers: [UploadsController],
  providers: [CloudinaryService, ConcurrentUploadsInterceptor],
})
export class UploadsModule {}
