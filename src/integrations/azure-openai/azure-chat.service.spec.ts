import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import { AzureChatService } from './azure-chat.service';

describe('AzureChatService', () => {
  const http = { post: jest.fn() };
  const config = { get: jest.fn() };
  let service: AzureChatService;

  const env: Record<string, string> = {
    AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com',
    AZURE_OPENAI_API_KEY: 'test-key',
    AZURE_OPENAI_CHAT_DEPLOYMENT: 'chat-deployment',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string) => env[key]);
    service = new AzureChatService(
      http as unknown as HttpService,
      config as unknown as ConfigService,
    );
  });

  it('returns null when the chat deployment is not configured', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'AZURE_OPENAI_CHAT_DEPLOYMENT' ? undefined : env[key],
    );
    await expect(
      service.extractLyrics('page text', { title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('returns the extracted content on success', async () => {
    http.post.mockReturnValue(
      of({
        data: { choices: [{ message: { content: 'Line one\nLine two' } }] },
      }),
    );
    await expect(
      service.extractLyrics('page text', { title: 'Song', artist: 'Artist' }),
    ).resolves.toBe('Line one\nLine two');
  });

  it('returns null when the model reports NOT_FOUND', async () => {
    http.post.mockReturnValue(
      of({ data: { choices: [{ message: { content: 'NOT_FOUND' } }] } }),
    );
    await expect(
      service.extractLyrics('page text', { title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
  });

  it('returns null when the request fails', async () => {
    http.post.mockReturnValue(
      throwError(() => new AxiosError('timeout', 'ECONNABORTED')),
    );
    await expect(
      service.extractLyrics('page text', { title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
  });
});
