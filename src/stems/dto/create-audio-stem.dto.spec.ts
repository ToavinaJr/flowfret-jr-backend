import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAudioStemDto } from './create-audio-stem.dto';

describe('CreateAudioStemDto', () => {
  const input = {
    provider: 'YOUTUBE',
    trackId: 'video',
    audioUrl: 'https://www.youtube.com/watch?v=video',
  };
  it('accepts the supported providers', async () => {
    for (const provider of ['YOUTUBE', 'AUDIUS']) {
      expect(
        await validate(
          plainToInstance(CreateAudioStemDto, { ...input, provider }),
        ),
      ).toHaveLength(0);
    }
  });
  it('rejects unsupported providers and non-HTTPS audio before queueing', async () => {
    for (const override of [
      { provider: 'SPOTIFY' },
      { audioUrl: 'http://localhost/audio' },
      { trackId: '' },
    ]) {
      expect(
        (
          await validate(
            plainToInstance(CreateAudioStemDto, { ...input, ...override }),
          )
        ).length,
      ).toBeGreaterThan(0);
    }
  });
});
