import { MusicProvider } from '@prisma/client';
import type { TranscriptionSegment } from '../../transcriptions/entities/transcription.types';
import { LyricsAlignmentService } from './lyrics-alignment.service';
import type { LyricsCacheService } from './lyrics-cache.service';
import type { GeniusLyricsProvider } from './providers/genius-lyrics.provider';

function segment(words: Array<[text: string, start: number]>): TranscriptionSegment {
  return {
    id: 'seg',
    start: words[0]?.[1] ?? 0,
    end: (words[words.length - 1]?.[1] ?? 0) + 1,
    text: words.map(([text]) => text).join(' '),
    words: words.map(([text, start]) => ({ text, start, end: start + 0.4 })),
  };
}

describe('LyricsAlignmentService', () => {
  const cache = { get: jest.fn(), set: jest.fn() };
  const geniusLyrics = { findLyrics: jest.fn() };
  let service: LyricsAlignmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LyricsAlignmentService(
      cache as unknown as LyricsCacheService,
      geniusLyrics as unknown as GeniusLyricsProvider,
    );
  });

  describe('align', () => {
    it('assigns the first matched ASR timestamp to each lyric line', () => {
      const lines = ['Hello world', 'It is me'];
      const asrWords = segment([
        ['hello', 0],
        ['world', 0.5],
        ['it', 5],
        ['is', 5.5],
        ['me', 6],
      ]).words.map((word) => ({
        text: word.text,
        startMs: Math.round(word.start * 1000),
      }));
      const result = service.align(lines, asrWords);
      expect(result).toEqual([
        { startTimeMs: 0, text: 'Hello world' },
        { startTimeMs: 5000, text: 'It is me' },
      ]);
    });

    it('interpolates lines with no matched words between known neighbors', () => {
      const lines = ['Hello world', 'Unmatched filler line', 'It is me'];
      const asrWords = [
        { text: 'hello', startMs: 0 },
        { text: 'world', startMs: 1000 },
        { text: 'it', startMs: 9000 },
        { text: 'is', startMs: 9500 },
        { text: 'me', startMs: 10000 },
      ];
      const result = service.align(lines, asrWords);
      expect(result).not.toBeNull();
      expect(result![0].startTimeMs).toBe(0);
      expect(result![1].startTimeMs).toBe(4500);
      expect(result![2].startTimeMs).toBe(9000);
    });

    it('keeps section headers in the output but excludes them from alignment', () => {
      const lines = ['[Chorus]', 'Hello world'];
      const asrWords = [
        { text: 'hello', startMs: 2000 },
        { text: 'world', startMs: 2500 },
      ];
      const result = service.align(lines, asrWords);
      expect(result).toEqual([
        { startTimeMs: 2000, text: '[Chorus]' },
        { startTimeMs: 2000, text: 'Hello world' },
      ]);
    });

    it('returns null when too few words match the ASR output', () => {
      const lines = ['Completely different lyrics text here'];
      const asrWords = [
        { text: 'xyz', startMs: 0 },
        { text: 'abc', startMs: 500 },
      ];
      expect(service.align(lines, asrWords)).toBeNull();
    });
  });

  describe('upgradeAfterTranscription', () => {
    const baseInput = {
      provider: MusicProvider.YOUTUBE,
      trackId: 'abc',
      title: 'Song',
      artist: 'Artist',
      duration: 120,
    };

    it('does nothing when title, artist or segments are missing', async () => {
      await service.upgradeAfterTranscription({
        ...baseInput,
        title: undefined,
        segments: [segment([['hello', 0]])],
      });
      expect(cache.get).not.toHaveBeenCalled();

      await service.upgradeAfterTranscription({ ...baseInput, segments: [] });
      expect(cache.get).not.toHaveBeenCalled();
    });

    it('skips when the cached lyrics are already synced', async () => {
      cache.get.mockResolvedValue({ synced: true, lines: [] });
      await service.upgradeAfterTranscription({
        ...baseInput,
        segments: [segment([['hello', 0]])],
      });
      expect(geniusLyrics.findLyrics).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('fetches Genius lyrics, aligns them and caches a synced result', async () => {
      cache.get.mockResolvedValue(undefined);
      geniusLyrics.findLyrics.mockResolvedValue({
        provider: 'genius',
        synced: false,
        instrumental: false,
        plainLyrics: 'Hello world',
        lines: [{ startTimeMs: null, text: 'Hello world' }],
      });
      await service.upgradeAfterTranscription({
        ...baseInput,
        segments: [segment([['hello', 0], ['world', 0.5]])],
      });
      expect(cache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          provider: 'genius',
          synced: true,
          lines: [{ startTimeMs: 0, text: 'Hello world' }],
        }),
        expect.any(Number),
      );
    });

    it('does not cache anything when alignment confidence is too low', async () => {
      cache.get.mockResolvedValue(undefined);
      geniusLyrics.findLyrics.mockResolvedValue({
        provider: 'genius',
        synced: false,
        instrumental: false,
        plainLyrics: 'Completely unrelated lyrics text',
        lines: [{ startTimeMs: null, text: 'Completely unrelated lyrics text' }],
      });
      await service.upgradeAfterTranscription({
        ...baseInput,
        segments: [segment([['xyz', 0], ['abc', 0.5]])],
      });
      expect(cache.set).not.toHaveBeenCalled();
    });
  });
});
