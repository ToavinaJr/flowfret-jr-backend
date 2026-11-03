import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { StemsAudioSourceService } from './stems-audio-source.service';
import { StemsWorkerConfigService } from './stems-worker-config.service';
import { AudiusService } from '../integrations/audius/audius.service';
import { YouTubeAudioService } from '../integrations/youtube/youtube-audio.service';
import { ConfigService } from '@nestjs/config';

it('passes the stems duration policy to YouTube and cleans up the extracted file', async () => {
  const youtube = {
    createStream: jest.fn().mockReturnValue({
      stream: Readable.from([Buffer.from('audio')]),
      dispose: jest.fn(),
    }),
  };
  const service = new StemsAudioSourceService(
    {} as AudiusService,
    youtube as unknown as YouTubeAudioService,
    new StemsWorkerConfigService(
      new ConfigService({ AUDIO_STEMS_MAX_DURATION_SECONDS: 420 }),
    ),
  );
  const extracted = await service.extractYouTubeAudio('video', 'stem');
  try {
    expect(youtube.createStream).toHaveBeenCalledWith('video', 'stem', {
      maxDurationSeconds: 420,
    });
    expect(await readFile(extracted.audioPath, 'utf8')).toBe('audio');
  } finally {
    await extracted.cleanup();
  }
  await expect(readFile(extracted.audioPath)).rejects.toMatchObject({
    code: 'ENOENT',
  });
});
