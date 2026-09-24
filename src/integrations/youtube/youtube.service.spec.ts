import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { YouTubeService } from './youtube.service';

describe('YouTubeService', () => {
  it('searches music videos and loads their durations', async () => {
    const httpService = {
      get: jest
        .fn()
        .mockReturnValueOnce(
          of({
            data: {
              pageInfo: { totalResults: 42 },
              nextPageToken: 'next-page',
              items: [
                {
                  id: { videoId: 'video-1' },
                  snippet: {
                    title: 'Song &amp; More',
                    channelId: 'channel-1',
                    channelTitle: 'Artist',
                    thumbnails: { high: { url: 'https://img.test/video.jpg' } },
                  },
                },
              ],
            },
          }),
        )
        .mockReturnValueOnce(
          of({
            data: {
              items: [
                { id: 'video-1', contentDetails: { duration: 'PT3M12S' } },
              ],
            },
          }),
        ),
    };
    const configService = { get: jest.fn(() => 'youtube-key') };
    const service = new YouTubeService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );

    await expect(
      service.searchMusic('song', 10, 'current-page'),
    ).resolves.toEqual({
      total: 42,
      nextPageToken: 'next-page',
      videos: [
        {
          id: 'video-1',
          title: 'Song & More',
          channelId: 'channel-1',
          channelTitle: 'Artist',
          thumbnailUrl: 'https://img.test/video.jpg',
          durationMs: 192000,
        },
      ],
    });
    const [, requestConfig] = httpService.get.mock.calls[0] as [
      string,
      { params: { pageToken?: string; maxResults: number } },
    ];
    expect(requestConfig).toMatchObject({
      params: { pageToken: 'current-page', maxResults: 10 },
    });
  });
});
