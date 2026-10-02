export const TRANSCRIPTION_QUEUE = 'transcriptions';
export const TRANSCRIPTION_JOB = 'transcribe';
export const ALLOWED_WHISPER_MODELS = [
  'tiny',
  'base',
  'small',
  'medium',
] as const;
export const DEFAULT_WHISPER_MODEL = 'small';
export const DEFAULT_ENGINE_VERSION = '1';
export const MAX_RETRY_ATTEMPTS = 3;

export const TRANSCRIPTION_EVENT = {
  PENDING: 'transcription.pending',
  PROCESSING: 'transcription.processing',
  MODEL_LOADING: 'transcription.model-loading',
  MODEL_READY: 'transcription.model-ready',
  PROGRESS: 'transcription.progress',
  SEGMENT: 'transcription.segment',
  READY_TO_PLAY: 'transcription.ready-to-play',
  COMPLETED: 'transcription.completed',
  FAILED: 'transcription.failed',
  HEARTBEAT: 'transcription.heartbeat',
} as const;

export const WORKER_MESSAGE = {
  STARTED: 'started',
  MODEL_LOADING: 'model-loading',
  MODEL_READY: 'model-ready',
  SEGMENT: 'segment',
  PROGRESS: 'progress',
  READY_TO_PLAY: 'ready-to-play',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const QUEUE_DIAGNOSTIC_STATUS = {
  READY: 'READY',
  NO_WORKER: 'NO_WORKER',
  UNAVAILABLE: 'QUEUE_UNAVAILABLE',
} as const;

export const TRANSCRIPTION_PHASE = {
  AUDIO_PREPARING: 'AUDIO_PREPARING',
  MODEL_LOADING: 'MODEL_LOADING',
  MODEL_READY: 'MODEL_READY',
  TRANSCRIBING: 'TRANSCRIBING',
  COMPLETED: 'COMPLETED',
} as const;

export const TRANSCRIPTION_ERROR_CODE = {
  NOT_FOUND: 'TRANSCRIPTION_NOT_FOUND',
  NOT_READY: 'TRANSCRIPTION_NOT_READY',
  ALREADY_RUNNING: 'TRANSCRIPTION_ALREADY_RUNNING',
  FAILED: 'TRANSCRIPTION_FAILED',
  PENDING_TIMEOUT: 'TRANSCRIPTION_PENDING_TIMEOUT',
  QUEUE_SATURATED: 'TRANSCRIPTION_QUEUE_SATURATED',
  REDIS_UNAVAILABLE: 'REDIS_UNAVAILABLE',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  WHISPER_FAILED: 'WHISPER_FAILED',
  WHISPER_TIMEOUT: 'WHISPER_TIMEOUT',
  AUDIO_URL_EXPIRED: 'AUDIO_URL_EXPIRED',
  AUDIO_DOWNLOAD_FAILED: 'AUDIO_DOWNLOAD_FAILED',
} as const;

export const RETRYABLE_TRANSCRIPTION_ERROR_CODES = new Set<string>([
  TRANSCRIPTION_ERROR_CODE.AUDIO_URL_EXPIRED,
  TRANSCRIPTION_ERROR_CODE.AUDIO_DOWNLOAD_FAILED,
]);
