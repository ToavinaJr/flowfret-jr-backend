import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTranscriptionDto } from './create-transcription.dto';

describe('CreateTranscriptionDto', () => {
  it('accepts an Audius HTTPS request and defaults the model', async () => {
    const dto = plainToInstance(CreateTranscriptionDto, {
      trackId: 'abc',
      audioUrl: 'https://api.audius.co/stream',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.model).toBe('small');
  });
  it('rejects local and unsupported URLs/models', async () => {
    const dto = plainToInstance(CreateTranscriptionDto, {
      trackId: '',
      audioUrl: 'file:///tmp/audio',
      model: 'large-v3',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
