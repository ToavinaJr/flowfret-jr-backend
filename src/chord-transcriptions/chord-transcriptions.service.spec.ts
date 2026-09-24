import { MusicProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChordTranscriptionsService } from './chord-transcriptions.service';

describe('ChordTranscriptionsService', () => {
  it('creates a cache entry only when the provider track is absent', async () => {
    const stored = {
      id: 'cache-id',
      provider: MusicProvider.YOUTUBE,
      providerTrackId: 'video-id',
      title: 'Song',
      artist: 'Artist',
      duration: 12,
      cues: [{ start: 0, end: 12, chord: 'Am' }],
      engineVersion: 'browser-chroma-v1',
    };
    const prisma = {
      chordTranscription: { upsert: jest.fn().mockResolvedValue(stored) },
    };
    const service = new ChordTranscriptionsService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.saveIfAbsent({
        provider: MusicProvider.YOUTUBE,
        providerTrackId: ' video-id ',
        title: 'Song',
        artist: 'Artist',
        duration: 12,
        cues: [{ start: 0, end: 12, chord: 'Am' }],
        engineVersion: 'browser-chroma-v1',
      }),
    ).resolves.toMatchObject({ id: 'cache-id', cues: stored.cues });
    expect(prisma.chordTranscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerTrackId: {
            provider: MusicProvider.YOUTUBE,
            providerTrackId: 'video-id',
          },
        },
        update: {},
      }),
    );
  });

  it('returns a previously stored transcription', async () => {
    const prisma = {
      chordTranscription: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cache-id',
          provider: MusicProvider.AUDIUS,
          providerTrackId: 'track-id',
          title: null,
          artist: null,
          duration: 4,
          cues: [{ start: 0, end: 4, chord: 'C' }],
          engineVersion: 'browser-chroma-v1',
        }),
      },
    };
    const service = new ChordTranscriptionsService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.find(MusicProvider.AUDIUS, 'track-id'),
    ).resolves.toMatchObject({
      providerTrackId: 'track-id',
      cues: [{ start: 0, end: 4, chord: 'C' }],
    });
  });
});
