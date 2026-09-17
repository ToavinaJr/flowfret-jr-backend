import { createHash } from 'node:crypto';
import type {
  TranscriptionSegment,
  TranscriptionWord,
  WorkerMessage,
} from './entities/transcription.types';

export function buildTranscriptionJobId(
  trackId: string,
  language: string | undefined,
  model: string,
  engineVersion: string,
): string {
  return createHash('sha256')
    .update([trackId, language ?? 'auto', model, engineVersion].join('|'))
    .digest('hex');
}

export function secondsToLrcTimestamp(seconds: number): string {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const minutes = Math.floor(centiseconds / 6000);
  const remainder = centiseconds % 6000;
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(remainder / 100)).padStart(2, '0')}.${String(remainder % 100).padStart(2, '0')}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function isWord(value: unknown): value is TranscriptionWord {
  if (!value || typeof value !== 'object') return false;
  const word = value as Record<string, unknown>;
  return (
    isFiniteNumber(word.start) &&
    isFiniteNumber(word.end) &&
    typeof word.text === 'string' &&
    (word.probability === undefined || isFiniteNumber(word.probability))
  );
}
export function isSegment(value: unknown): value is TranscriptionSegment {
  if (!value || typeof value !== 'object') return false;
  const segment = value as Record<string, unknown>;
  return (
    typeof segment.id === 'string' &&
    isFiniteNumber(segment.start) &&
    isFiniteNumber(segment.end) &&
    segment.end >= segment.start &&
    typeof segment.text === 'string' &&
    Array.isArray(segment.words) &&
    segment.words.every(isWord)
  );
}

export function parseWorkerMessage(line: string): WorkerMessage {
  const value: unknown = JSON.parse(line);
  if (!value || typeof value !== 'object')
    throw new Error('Invalid worker message');
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case 'started':
      if (isFiniteNumber(message.duration))
        return message as unknown as WorkerMessage;
      break;
    case 'model-loading':
    case 'model-ready':
      return message as unknown as WorkerMessage;
    case 'segment':
      if (isSegment(message.segment))
        return message as unknown as WorkerMessage;
      break;
    case 'progress':
      if (
        isFiniteNumber(message.progress) &&
        isFiniteNumber(message.bufferedUntil)
      )
        return message as unknown as WorkerMessage;
      break;
    case 'ready-to-play':
      if (isFiniteNumber(message.bufferedUntil))
        return message as unknown as WorkerMessage;
      break;
    case 'completed':
      if (
        isFiniteNumber(message.duration) &&
        typeof message.detectedLanguage === 'string' &&
        typeof message.lrc === 'string'
      )
        return message as unknown as WorkerMessage;
      break;
    case 'failed':
      if (
        typeof message.errorCode === 'string' &&
        typeof message.message === 'string'
      )
        return message as unknown as WorkerMessage;
      break;
  }
  throw new Error('Invalid worker message');
}
