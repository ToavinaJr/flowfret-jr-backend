import { validate } from 'class-validator';
import { UploadTeachingMaterialBody } from './uploads.controller';

describe('UploadTeachingMaterialBody', () => {
  it('rejects malformed course and lesson identifiers', async () => {
    const body = Object.assign(new UploadTeachingMaterialBody(), {
      courseId: 'not-a-uuid',
      lessonId: 'not-a-uuid',
      title: 'Valid title',
    });

    const errors = await validate(body);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['courseId', 'lessonId']),
    );
  });

  it('accepts a valid course and optional lesson', async () => {
    const body = Object.assign(new UploadTeachingMaterialBody(), {
      courseId: '11111111-1111-4111-8111-111111111111',
      lessonId: '22222222-2222-4222-8222-222222222222',
      title: 'Warm-up lesson',
    });

    await expect(validate(body)).resolves.toHaveLength(0);
  });
});
