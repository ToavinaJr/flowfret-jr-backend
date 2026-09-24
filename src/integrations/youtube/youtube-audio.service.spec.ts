import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
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

  it('fails clearly when a configured cookies secret file is missing', () => {
    const configured = new YouTubeAudioService({
      get: jest.fn((key: string) =>
        key === 'YOUTUBE_COOKIES_FILE'
          ? 'missing-youtube-cookies.txt'
          : undefined,
      ),
    } as unknown as ConfigService);

    expect(() => configured.createStream('x77VucXB4jo')).toThrow(
      ServiceUnavailableException,
    );
  });
});
