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
