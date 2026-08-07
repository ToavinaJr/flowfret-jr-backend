export interface TranscriptionWord {
  start: number;
  end: number;
  text: string;
  probability?: number;
}

export interface TranscriptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  words: TranscriptionWord[];
}

export type TranscriptionEventType =
  | 'transcription.pending'
  | 'transcription.processing'
  | 'transcription.progress'
  | 'transcription.segment'
  | 'transcription.ready-to-play'
  | 'transcription.completed'
  | 'transcription.failed'
  | 'transcription.heartbeat';

export interface TranscriptionEvent {
  type: TranscriptionEventType;
  transcriptionId: string;
  progress?: number;
  bufferedUntil?: number;
  readyToPlay?: boolean;
  segment?: TranscriptionSegment;
  errorCode?: string;
  message?: string;
  timestamp?: string;
}

export interface TranscriptionJobData {
  transcriptionId: string;
  trackId: string;
  audioUrl: string;
  language?: string;
  model: string;
}

export type WorkerMessage =
  | { type: 'started'; duration: number }
  | { type: 'segment'; segment: TranscriptionSegment }
  | { type: 'progress'; progress: number; bufferedUntil: number }
  | { type: 'ready-to-play'; bufferedUntil: number }
  | {
      type: 'completed';
      duration: number;
      detectedLanguage: string;
      lrc: string;
    }
  | { type: 'failed'; errorCode: string; message: string };
