import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { YouTubeAudioService } from './youtube-audio.service';

describe('YouTubeAudioService', () => {
  const service = new YouTubeAudioService({
    get: jest.fn(),
  } as unknown as ConfigService);

  it.each(['', 'short', 'x77VucXB4jo&list=other', '../video-id'])(
    'rejects invalid video id %p before starting an extractor',
    (videoId) => {
      expect(() => service.createStream(videoId)).toThrow(BadRequestException);
    },
  );
});
