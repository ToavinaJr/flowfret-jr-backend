import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AudioStemStatus, MusicProvider } from '@prisma/client';
import { readFile, rm } from 'node:fs/promises';
import type { Job } from 'bullmq';
import type { AudioStemJobData } from './entities/stem.types';
import { AUDIO_STEMS_QUEUE, STEMS_ERROR_CODE } from './stems.constants';
import { StemsRepository } from './stems.repository';
import { StemsAudioSourceService } from './stems-audio-source.service';
import { StemsBridgeService } from './stems-bridge.service';
import { CloudinaryService } from '../uploads/cloudinary.service';

@Injectable()
@Processor(AUDIO_STEMS_QUEUE, {
  concurrency: Number(process.env.AUDIO_STEMS_CONCURRENCY ?? 1),
})
export class StemsProcessor extends WorkerHost {
  private readonly logger = new Logger(StemsProcessor.name);

  constructor(
    private readonly repository: StemsRepository,
    private readonly audioSources: StemsAudioSourceService,
    private readonly bridge: StemsBridgeService,
    private readonly cloudinary: CloudinaryService,
  ) {
    super();
  }

  async process(job: Job<AudioStemJobData>): Promise<void> {
    const { audioStemId, trackId, provider, audioUrl } = job.data;
    const startedAt = Date.now();
    this.logger.log(
      JSON.stringify({
        event: 'audio_stems.job_started',
        audioStemId,
        trackId,
        provider,
        jobId: job.id,
        attemptsMade: job.attemptsMade,
      }),
    );
    const claimed = await this.repository.claimPending(audioStemId);
    if (!claimed) {
      this.logger.warn(
        JSON.stringify({
          event: 'audio_stems.job_skipped_not_pending',
          audioStemId,
          jobId: job.id,
        }),
      );
      return;
    }
    let extracted:
      { audioPath: string; cleanup: () => Promise<void> } | undefined;
    try {
      const separationInput: {
        audioStemId: string;
        audioUrl?: string;
        audioPath?: string;
      } = {
        audioStemId,
      };
      if (provider === MusicProvider.YOUTUBE) {
        extracted = await this.audioSources.extractYouTubeAudio(
          trackId,
          audioStemId,
        );
        separationInput.audioPath = extracted.audioPath;
      } else {
        separationInput.audioUrl = await this.audioSources.resolve(
          provider,
          trackId,
          audioUrl,
        );
      }
      const result = await this.bridge.separate(separationInput);
      const [vocals, instrumental] = await Promise.all([
        readFile(result.vocalsPath),
        readFile(result.instrumentalPath),
      ]);
      const [vocalsUpload, instrumentalUpload] = await Promise.all([
        this.cloudinary.uploadAudioStem({
          buffer: vocals,
          filename: `${audioStemId}-vocals.mp3`,
        }),
        this.cloudinary.uploadAudioStem({
          buffer: instrumental,
          filename: `${audioStemId}-instrumental.mp3`,
        }),
      ]);
      await rm(result.tempDir, { recursive: true, force: true });
      await this.repository.update(audioStemId, {
        status: AudioStemStatus.COMPLETED,
        duration: result.duration,
        vocalsUrl: vocalsUpload.url,
        vocalsPublicId: vocalsUpload.publicId,
        vocalsFileSize: BigInt(vocalsUpload.fileSize),
        instrumentalUrl: instrumentalUpload.url,
        instrumentalPublicId: instrumentalUpload.publicId,
        instrumentalFileSize: BigInt(instrumentalUpload.fileSize),
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      });
      this.logger.log(
        JSON.stringify({
          event: 'audio_stems.job_completed',
          audioStemId,
          jobId: job.id,
          elapsedMs: Date.now() - startedAt,
        }),
      );
    } catch (error) {
      await this.handleFailure(job, error, startedAt);
    } finally {
      if (extracted) await extracted.cleanup();
    }
  }

  private async handleFailure(
    job: Job<AudioStemJobData>,
    error: unknown,
    startedAt: number,
  ): Promise<never> {
    const { audioStemId } = job.data;
    const finalAttempt = job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1);
    if (!finalAttempt) {
      await this.repository.update(audioStemId, {
        status: AudioStemStatus.PENDING,
      });
      this.logger.warn(
        JSON.stringify({
          event: 'audio_stems.job_retry_scheduled',
          audioStemId,
          jobId: job.id,
          errorCode: this.errorCode(error),
          nextAttempt: job.attemptsMade + 2,
        }),
      );
    } else {
      await this.repository.markFailed(
        audioStemId,
        this.errorCode(error),
        'Vocal separation failed',
      );
      this.logger.error(
        JSON.stringify({
          event: 'audio_stems.job_failed',
          audioStemId,
          jobId: job.id,
          errorCode: this.errorCode(error),
          elapsedMs: Date.now() - startedAt,
        }),
      );
    }
    throw error;
  }

  private errorCode(error: unknown): string {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
    )
      return (error as { code: string }).code;
    return STEMS_ERROR_CODE.DEMUCS_FAILED;
  }
}
