import {
  MusicProvider,
  Prisma,
  Transcription,
  TranscriptionStatus,
} from '@prisma/client';
import type { TranscriptionSegment } from './entities/transcription.types';

export interface TranscriptionResponse {
  transcriptionId: string;
  provider: MusicProvider;
  trackId: string;
  title: string | null;
  artist: string | null;
  createdAt: Date;
  updatedAt: Date;
  jobId: string | null;
  status: TranscriptionStatus;
  cached: boolean;
  readyToPlay: boolean;
  bufferedUntil: number;
  progress: number;
  segments: TranscriptionSegment[];
  language: string | null;
  detectedLanguage: string | null;
  lrcAvailable: boolean;
  processingPhase: string | null;
  error: { code: string; message: string } | null;
}

function segments(value: Prisma.JsonValue | null): TranscriptionSegment[] {
  return Array.isArray(value)
    ? (value as unknown as TranscriptionSegment[])
    : [];
}

export function toTranscriptionResponse(
  item: Transcription,
  jobId: string | null,
  cached: boolean,
): TranscriptionResponse {
  return {
    transcriptionId: item.id,
    provider: item.provider,
    trackId: item.trackId,
    title: item.title,
    artist: item.artist,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    jobId,
    status: item.status,
    cached,
    readyToPlay: item.readyToPlay,
    bufferedUntil: item.bufferedUntil,
    progress: item.progress,
    segments: segments(item.segments),
    language: item.requestedLanguage === 'auto' ? null : item.requestedLanguage,
    detectedLanguage: item.detectedLanguage,
    lrcAvailable: Boolean(item.lrcContent),
    processingPhase: item.processingPhase,
    error: item.errorCode
      ? {
          code: item.errorCode,
          message: item.errorMessage ?? 'Transcription failed',
        }
      : null,
  };
}
