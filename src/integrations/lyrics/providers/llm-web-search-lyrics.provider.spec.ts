import { HttpService } from '@nestjs/axios';
import { lookup } from 'node:dns/promises';
import { of } from 'rxjs';
import type { AzureChatService } from '../../azure-openai/azure-chat.service';
import type { BingSearchService } from '../../web-search/bing-search.service';
import { LlmWebSearchLyricsProvider } from './llm-web-search-lyrics.provider';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));

const mockedLookup = lookup as jest.Mock;

describe('LlmWebSearchLyricsProvider', () => {
  const search = { search: jest.fn() };
  const chat = { extractLyrics: jest.fn() };
  const http = { get: jest.fn() };
  let provider: LlmWebSearchLyricsProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
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

  it('pins HTTPS requests to a validated public IPv4 address and caps the body', async () => {
    search.search.mockResolvedValue([
      { url: 'https://example.com/a', snippet: '' },
    ]);
    http.get.mockReturnValue(
      of({ data: '<html><body>Safe page text</body></html>' }),
    );
    chat.extractLyrics.mockResolvedValue('Safe page text');

    await provider.findLyrics({ title: 'Song', artist: 'Artist' });

    expect(http.get).toHaveBeenCalledWith(
      'https://example.com/a',
      expect.objectContaining({
        maxRedirects: 0,
        maxContentLength: 1_000_000,
        proxy: false,
        httpsAgent: expect.any(Object) as object,
      }),
    );
  });

  it('does not fetch search results resolving to a private address', async () => {
    search.search.mockResolvedValue([
      { url: 'https://lyrics.example/a', snippet: '' },
    ]);
    mockedLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
    expect(http.get).not.toHaveBeenCalled();
    expect(chat.extractLyrics).not.toHaveBeenCalled();
  });

  it('rejects non-HTTPS, credentialed, and non-standard-port result URLs', async () => {
    search.search.mockResolvedValue([
      { url: 'http://example.com/a', snippet: '' },
      { url: 'https://user:pass@example.com/a', snippet: '' },
      { url: 'https://example.com:8443/a', snippet: '' },
    ]);

    await expect(
      provider.findLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
    expect(http.get).not.toHaveBeenCalled();
    expect(mockedLookup).not.toHaveBeenCalled();
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
