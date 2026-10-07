import { AudioStem, AudioStemStatus, MusicProvider } from '@prisma/client';

export interface AudioStemResponse {
  audioStemId: string;
  provider: MusicProvider;
  trackId: string;
  title: string | null;
  artist: string | null;
  status: AudioStemStatus;
  cached: boolean;
  progress: number;
  duration: number | null;
  vocalsUrl: string | null;
  instrumentalUrl: string | null;
  error: { code: string; message: string } | null;
}

export function toAudioStemResponse(
  item: AudioStem,
  cached: boolean,
): AudioStemResponse {
  return {
    audioStemId: item.id,
    provider: item.provider,
    trackId: item.trackId,
    title: item.title,
    artist: item.artist,
    status: item.status,
    cached,
    progress: item.progress,
    duration: item.duration,
    vocalsUrl: item.vocalsUrl,
    instrumentalUrl: item.instrumentalUrl,
    error: item.errorCode
      ? {
          code: item.errorCode,
          message: item.errorMessage ?? 'Vocal separation failed',
        }
      : null,
  };
}
