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
export const MAX_TEACHING_FILE_BYTES = 50 * 1024 * 1024;
const TEACHING_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);
export type TeachingResourceType = 'IMAGE' | 'VIDEO';
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

function hasValidTeachingSignature(buffer: Buffer, type: string): boolean {
  if (type.startsWith('image/')) return hasValidSignature(buffer, type);
  if (type === 'application/pdf')
    return buffer.subarray(0, 5).toString() === '%PDF-';
  if (type === 'video/webm')
    return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (type === 'video/mp4' || type === 'video/quicktime')
    return buffer.subarray(4, 8).toString() === 'ftyp';
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
        `Cloudinary rejected image upload (status=${response.status})`,
      );
      throw new ExternalServiceException(
        'UPLOAD_FAILED',
        'Unable to upload the file.',
      );
    }
    this.logger.log(`Cloudinary image uploaded (publicId=${result.public_id})`);
    return { url: result.secure_url, publicId: result.public_id };
  }

  async uploadTeachingFile(file: UploadedImage): Promise<{
    url: string;
    publicId: string;
    resourceType: TeachingResourceType;
  }> {
    if (
      !file ||
      !TEACHING_TYPES.has(file.mimetype) ||
      file.size > MAX_TEACHING_FILE_BYTES ||
      !hasValidTeachingSignature(file.buffer, file.mimetype)
    ) {
      throw new ApplicationException(
        'UPLOAD_INVALID_FILE',
        'Unsupported or invalid teaching file.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const resourceType: TeachingResourceType = file.mimetype.startsWith(
      'video/',
    )
      ? 'VIDEO'
      : 'IMAGE';
    const endpointType = resourceType.toLowerCase();
    const cloudName = getRequiredConfig(this.config, 'CLOUDINARY_CLOUD_NAME');
    const apiKey = getRequiredConfig(this.config, 'CLOUDINARY_API_KEY');
    const apiSecret = getRequiredConfig(this.config, 'CLOUDINARY_API_SECRET');
    const folder = `${getRequiredConfig(this.config, 'CLOUDINARY_FOLDER')}/teaching`;
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHash('sha1')
      .update(
        `folder=${folder}&timestamp=${timestamp}&type=authenticated${apiSecret}`,
      )
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
    body.append('type', 'authenticated');
    body.append('signature', signature);
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${endpointType}/upload`,
      { method: 'POST', body, signal: AbortSignal.timeout(this.timeoutMs()) },
    );
    const result = (await response.json()) as {
      secure_url?: string;
      public_id?: string;
    };
    if (!response.ok || !result.secure_url || !result.public_id)
      throw new ExternalServiceException(
        'UPLOAD_FAILED',
        'Unable to upload the teaching file.',
      );
    return { url: result.secure_url, publicId: result.public_id, resourceType };
  }

  authenticatedDeliveryUrl(
    storagePath: string,
    resourceType: TeachingResourceType,
  ): string {
    const url = new URL(storagePath);
    const cloudName = getRequiredConfig(this.config, 'CLOUDINARY_CLOUD_NAME');
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'res.cloudinary.com' ||
      !url.pathname.startsWith(
        `/${cloudName}/${resourceType.toLowerCase()}/authenticated/`,
      )
    )
      throw new Error('Invalid authenticated media path');
    const remainder = url.pathname.split('/authenticated/')[1];
    if (!remainder) throw new Error('Invalid authenticated media path');
    let signingPath: string;
    try {
      // Cloudinary signs the path components (version and public ID), before
      // URL encoding. The upload response stores those components encoded.
      signingPath = decodeURIComponent(remainder);
    } catch {
      throw new Error('Invalid authenticated media path');
    }
    const secret = getRequiredConfig(this.config, 'CLOUDINARY_API_SECRET');
    const signature = createHash('sha1')
      .update(`${signingPath}${secret}`)
      .digest('base64url')
      .slice(0, 8);
    url.pathname = url.pathname.replace(
      '/authenticated/',
      `/authenticated/s--${signature}--/`,
    );
    return url.toString();
  }

  async deleteTeachingFile(
    publicId: string,
    resourceType: TeachingResourceType,
  ): Promise<void> {
    await this.deleteStoredFile(publicId, resourceType, 'authenticated');
  }

  async deleteImage(publicId: string): Promise<void> {
    await this.deleteStoredFile(publicId, 'IMAGE', 'upload');
  }

  private async deleteStoredFile(
    publicId: string,
    resourceType: TeachingResourceType,
    type: 'authenticated' | 'upload',
  ): Promise<void> {
    const cloudName = getRequiredConfig(this.config, 'CLOUDINARY_CLOUD_NAME');
    const apiKey = getRequiredConfig(this.config, 'CLOUDINARY_API_KEY');
    const apiSecret = getRequiredConfig(this.config, 'CLOUDINARY_API_SECRET');
    const timestamp = Math.floor(Date.now() / 1000);
    const params = `public_id=${publicId}&timestamp=${timestamp}&type=${type}`;
    const signature = createHash('sha1')
      .update(`${params}${apiSecret}`)
      .digest('hex');
    const body = new FormData();
    body.append('public_id', publicId);
    body.append('api_key', apiKey);
    body.append('timestamp', String(timestamp));
    body.append('type', type);
    body.append('signature', signature);
    const endpointType = resourceType.toLowerCase();
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${endpointType}/destroy`,
      { method: 'POST', body, signal: AbortSignal.timeout(this.timeoutMs()) },
    );
    if (!response.ok)
      throw new Error(`Cloudinary cleanup failed for ${publicId}`);
  }

  private timeoutMs(): number {
    const value = Number(this.config.get('EXTERNAL_HTTP_TIMEOUT_MS'));
    return Number.isInteger(value) && value > 0 ? value : 15_000;
  }
}
