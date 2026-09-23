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
  (typeof TRANSCRIPTION_EVENT)[keyof typeof TRANSCRIPTION_EVENT];

export interface TranscriptionEvent {
  type: TranscriptionEventType;
  transcriptionId: string;
  progress?: number;
  bufferedUntil?: number;
  readyToPlay?: boolean;
  processingPhase?: string;
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
  | { type: typeof WORKER_MESSAGE.STARTED; duration: number }
  | { type: typeof WORKER_MESSAGE.MODEL_LOADING }
  | { type: typeof WORKER_MESSAGE.MODEL_READY }
  | { type: typeof WORKER_MESSAGE.SEGMENT; segment: TranscriptionSegment }
  | {
      type: typeof WORKER_MESSAGE.PROGRESS;
      progress: number;
      bufferedUntil: number;
    }
  | {
      type: typeof WORKER_MESSAGE.READY_TO_PLAY;
      bufferedUntil: number;
    }
  | {
      type: typeof WORKER_MESSAGE.COMPLETED;
      duration: number;
      detectedLanguage: string;
      lrc: string;
    }
  | {
      type: typeof WORKER_MESSAGE.FAILED;
      errorCode: string;
      message: string;
    };
import {
  TRANSCRIPTION_EVENT,
  WORKER_MESSAGE,
} from '../transcriptions.constants';
