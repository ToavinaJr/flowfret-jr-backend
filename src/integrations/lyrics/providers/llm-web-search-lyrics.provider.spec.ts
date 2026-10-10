import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import type { AzureChatService } from '../../azure-openai/azure-chat.service';
import type { BingSearchService } from '../../web-search/bing-search.service';
import { LlmWebSearchLyricsProvider } from './llm-web-search-lyrics.provider';

describe('LlmWebSearchLyricsProvider', () => {
  const search = { search: jest.fn() };
  const chat = { extractLyrics: jest.fn() };
  const http = { get: jest.fn() };
  let provider: LlmWebSearchLyricsProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new LlmWebSearchLyricsProvider(
      search as unknown as BingSearchService,
      chat as unknown as AzureChatService,
      http as unknown as HttpService,
    );
  });

  it('returns null when the search finds nothing', async () => {
    search.search.mockResolvedValue([]);
    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
    expect(chat.extractLyrics).not.toHaveBeenCalled();
  });

  it('returns grounded lyrics extracted from a genuinely fetched page', async () => {
    search.search.mockResolvedValue([
      { url: 'https://example.com/a', snippet: '' },
    ]);
    http.get.mockReturnValue(
      of({
        data: '<html><body>Hello world\nIt is me</body></html>',
      }),
    );
    chat.extractLyrics.mockResolvedValue('Hello world\nIt is me');
    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toEqual({
      provider: 'llm-web-search',
      synced: false,
      instrumental: false,
      plainLyrics: 'Hello world\nIt is me',
      lines: [
        { startTimeMs: null, text: 'Hello world' },
        { startTimeMs: null, text: 'It is me' },
      ],
    });
  });

  it('discards an ungrounded extraction and moves to the next candidate', async () => {
    search.search.mockResolvedValue([
      { url: 'https://example.com/a', snippet: '' },
      { url: 'https://example.com/b', snippet: '' },
    ]);
    http.get
      .mockReturnValueOnce(
        of({
          data: '<html><body>Completely unrelated page content</body></html>',
        }),
      )
      .mockReturnValueOnce(
        of({
          data: '<html><body>Real lyrics line one\nReal lyrics line two</body></html>',
        }),
      );
    chat.extractLyrics
      .mockResolvedValueOnce(
        'Totally different lyrics the model made up from memory',
      )
      .mockResolvedValueOnce('Real lyrics line one\nReal lyrics line two');

    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toEqual({
      provider: 'llm-web-search',
      synced: false,
      instrumental: false,
      plainLyrics: 'Real lyrics line one\nReal lyrics line two',
      lines: [
        { startTimeMs: null, text: 'Real lyrics line one' },
        { startTimeMs: null, text: 'Real lyrics line two' },
      ],
    });
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('returns null when every candidate fails the grounding check', async () => {
    search.search.mockResolvedValue([
      { url: 'https://example.com/a', snippet: '' },
    ]);
    http.get.mockReturnValue(
      of({
        data: '<html><body>Completely unrelated page content</body></html>',
      }),
    );
    chat.extractLyrics.mockResolvedValue(
      'Totally different lyrics the model made up from memory',
    );
    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
  });

  it('returns null when the page fetch fails', async () => {
    search.search.mockResolvedValue([
      { url: 'https://example.com/a', snippet: '' },
    ]);
    http.get.mockImplementation(() => {
      throw new Error('network error');
    });
    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
    expect(chat.extractLyrics).not.toHaveBeenCalled();
  });
});
