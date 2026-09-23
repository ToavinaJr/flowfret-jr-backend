import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { getRequiredConfig } from '../common/required-config';
import {
  ApplicationException,
  ExternalServiceException,
} from '../common/application-exception';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_POST_IMAGES = 12;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

function hasValidSignature(buffer: Buffer, type: string): boolean {
  if (type === 'image/jpeg')
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (type === 'image/png')
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'image/webp')
    return (
      buffer.subarray(0, 4).toString() === 'RIFF' &&
      buffer.subarray(8, 12).toString() === 'WEBP'
    );
  return false;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  constructor(private readonly config: ConfigService) {}

  async uploadImage(
    file: UploadedImage,
  ): Promise<{ url: string; publicId: string }> {
    if (
      !file ||
      !ALLOWED_TYPES.has(file.mimetype) ||
      file.size > MAX_IMAGE_BYTES ||
      !hasValidSignature(file.buffer, file.mimetype)
    ) {
      throw new ApplicationException(
        'UPLOAD_INVALID_FILE',
        'The image file is invalid.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const cloudName = getRequiredConfig(this.config, 'CLOUDINARY_CLOUD_NAME');
    const apiKey = getRequiredConfig(this.config, 'CLOUDINARY_API_KEY');
    const apiSecret = getRequiredConfig(this.config, 'CLOUDINARY_API_SECRET');
    const folder = getRequiredConfig(this.config, 'CLOUDINARY_FOLDER');
    const timestamp = Math.floor(Date.now() / 1000);
    this.logger.log(
      `Uploading validated image to Cloudinary (type=${file.mimetype}, size=${file.size}, folder=${folder})`,
    );
    const signature = createHash('sha1')
      .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
      .digest('hex');
    const body = new FormData();
    body.append(
      'file',
      new Blob([Uint8Array.from(file.buffer)], { type: file.mimetype }),
      file.originalname,
    );
    body.append('api_key', apiKey);
    body.append('timestamp', String(timestamp));
    body.append('folder', folder);
    body.append('signature', signature);
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(this.timeoutMs()),
      },
    );
    const result = (await response.json()) as {
      secure_url?: string;
      public_id?: string;
      error?: { message?: string };
    };
    if (!response.ok || !result.secure_url || !result.public_id) {
      this.logger.error(
        `Cloudinary rejected image upload (status=${response.status}, reason=${result.error?.message ?? 'unknown'})`,
      );
      throw new ExternalServiceException(
        'UPLOAD_FAILED',
        'Unable to upload the file.',
      );
    }
    this.logger.log(`Cloudinary image uploaded (publicId=${result.public_id})`);
    return { url: result.secure_url, publicId: result.public_id };
  }

  async deleteImage(publicId: string): Promise<void> {
    const cloudName = getRequiredConfig(this.config, 'CLOUDINARY_CLOUD_NAME');
    const apiKey = getRequiredConfig(this.config, 'CLOUDINARY_API_KEY');
    const apiSecret = getRequiredConfig(this.config, 'CLOUDINARY_API_SECRET');
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHash('sha1')
      .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
      .digest('hex');
    const body = new FormData();
    body.append('public_id', publicId);
    body.append('api_key', apiKey);
    body.append('timestamp', String(timestamp));
    body.append('signature', signature);
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(this.timeoutMs()),
      },
    );
    if (!response.ok) {
      this.logger.error(
        `Cloudinary cleanup failed (publicId=${publicId}, status=${response.status})`,
      );
      throw new Error(`Cloudinary cleanup failed for ${publicId}`);
    }
  }

  private timeoutMs(): number {
    const value = Number(this.config.get('EXTERNAL_HTTP_TIMEOUT_MS'));
    return Number.isInteger(value) && value > 0 ? value : 15_000;
  }
}
