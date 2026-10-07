import type { MusicProvider } from '@prisma/client';

export interface AudioStemJobData {
  audioStemId: string;
  trackId: string;
  provider: MusicProvider;
  audioUrl: string;
}

export type StemWorkerMessage =
  | { type: 'started'; duration: number }
  | {
      type: 'completed';
      duration: number;
      vocalsPath: string;
      instrumentalPath: string;
      tempDir: string;
    }
  | { type: 'failed'; errorCode: string; message: string };
