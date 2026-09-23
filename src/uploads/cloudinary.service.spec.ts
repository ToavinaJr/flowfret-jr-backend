import type { ConfigService } from '@nestjs/config';
import { ApplicationException } from '../common/application-exception';
import { CloudinaryService, type UploadedImage } from './cloudinary.service';

const config = {
  get: jest.fn((key: string) => {
    const values: Record<string, string> = {
      CLOUDINARY_CLOUD_NAME: 'cloud',
      CLOUDINARY_API_KEY: 'key',
      CLOUDINARY_API_SECRET: 'secret',
      CLOUDINARY_FOLDER: 'uploads',
      EXTERNAL_HTTP_TIMEOUT_MS: '1000',
    };
    return values[key];
  }),
} as unknown as ConfigService;

const jpeg: UploadedImage = {
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  mimetype: 'image/jpeg',
  size: 4,
  originalname: 'image.jpg',
};

describe('CloudinaryService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rejects content whose magic bytes do not match its MIME type', async () => {
    const service = new CloudinaryService(config);
    const error = await service
      .uploadImage({ ...jpeg, buffer: Buffer.from('not-an-image') })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApplicationException);
    expect((error as ApplicationException).getResponse()).toEqual({
      code: 'UPLOAD_INVALID_FILE',
      message: 'The image file is invalid.',
    });
  });

  it('logs provider detail but returns only a stable application error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ error: { message: 'provider secret detail' } }),
    } as Response);
    const service = new CloudinaryService(config);

    const error = await service
      .uploadImage(jpeg)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApplicationException);
    expect((error as ApplicationException).getResponse()).toEqual({
      code: 'UPLOAD_FAILED',
      message: 'Unable to upload the file.',
    });
  });
});
