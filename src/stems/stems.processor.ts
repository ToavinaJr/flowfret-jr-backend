import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AudioStemStatus, MusicProvider } from '@prisma/client';
import { readFile, rm } from 'node:fs/promises';
import { UnrecoverableError, type Job } from 'bullmq';
import type { AudioStemJobData } from './entities/stem.types';
import { AUDIO_STEMS_QUEUE, STEMS_ERROR_CODE } from './stems.constants';
import { StemsRepository } from './stems.repository';
import { StemsAudioSourceService } from './stems-audio-source.service';
import { StemsBridgeService } from './stems-bridge.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { getEnvironmentPositiveInteger } from '../common/environment';

type StemStage = 'extract_audio' | 'separate' | 'upload' | 'save_result';

@Injectable()
@Processor(AUDIO_STEMS_QUEUE, {
  concurrency: getEnvironmentPositiveInteger('AUDIO_STEMS_CONCURRENCY', 1),
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
    // BullMQ only grants this job to one worker. A stalled job can retain its
    // previous DB state after the old worker died; completed/failed rows remain protected.
    const claimed = await this.repository.claimPending(
      audioStemId,
      job.stalledCounter > 0,
    );
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
    let outputDirectory: string | undefined;
    let progressWrites = Promise.resolve();
    // Most failures reach the client as one generic code; the stage says which
    // part of the pipeline actually broke.
    let stage: StemStage = 'extract_audio';
    try {
      const separationInput: {
        audioStemId: string;
        audioUrl?: string;
        audioPath?: string;
        engineVersion?: string;
      } = {
        audioStemId,
        engineVersion: job.data.engineVersion,
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
      stage = 'separate';
      await this.repository.update(audioStemId, {
        status: AudioStemStatus.PROCESSING,
      });
      const result = await this.bridge.separate(separationInput, (progress) => {
        progressWrites = progressWrites
          .then(async () => {
            await this.repository.update(audioStemId, { progress });
          })
          .catch(() => {
            /* Repository logs progress-write failures. */
          });
      });
      outputDirectory = result.tempDir;
      await progressWrites;
      stage = 'upload';
      await this.repository.update(audioStemId, { progress: 95 });
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
      stage = 'save_result';
      await this.repository.update(audioStemId, {
        status: AudioStemStatus.COMPLETED,
        progress: 100,
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
      await progressWrites;
      await this.handleFailure(job, error, startedAt, stage);
    } finally {
      if (outputDirectory)
        await rm(outputDirectory, { recursive: true, force: true });
      if (extracted) await extracted.cleanup();
    }
  }

  private async handleFailure(
    job: Job<AudioStemJobData>,
    error: unknown,
    startedAt: number,
    stage: StemStage,
  ): Promise<never> {
    const { audioStemId } = job.data;
    const code = this.errorCode(error);
    const cause = this.describeError(error);
    const permanent = [
      'AUDIO_TOO_LONG',
      'AUDIO_TOO_LARGE',
      'INVALID_AUDIO_URL',
      'AUDIO_HOST_NOT_ALLOWED',
      'DEMUCS_TIMEOUT',
    ].includes(code);
    const finalAttempt =
      permanent || job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1);
    if (!finalAttempt) {
      await this.repository.update(audioStemId, {
        status: AudioStemStatus.PENDING,
        progress: 0,
      });
      this.logger.warn(
        JSON.stringify({
          event: 'audio_stems.job_retry_scheduled',
          audioStemId,
          jobId: job.id,
          errorCode: code,
          stage,
          ...cause,
          nextAttempt: job.attemptsMade + 2,
        }),
      );
    } else {
      // Log first: if the database is the thing that failed, markFailed throws.
      this.logger.error(
        JSON.stringify({
          event: 'audio_stems.job_failed',
          audioStemId,
          jobId: job.id,
          errorCode: code,
          stage,
          ...cause,
          elapsedMs: Date.now() - startedAt,
        }),
      );
      // The stored message reaches API clients: stage only, details stay in logs.
      await this.repository.markFailed(
        audioStemId,
        code,
        `Vocal separation failed (${stage})`,
      );
    }
    if (permanent) throw new UnrecoverableError(code);
    throw error;
  }

  private describeError(error: unknown) {
    const failure = error instanceof Error ? error : new Error(String(error));
    const clean = (text: string) =>
      text.replace(/https?:\/\/\S+/gi, '[redacted-url]');
    return {
      errorName: failure.name,
      // The end of a worker's output is where its real error is.
      errorDetail: clean(failure.message).slice(-500),
      stack: clean(failure.stack?.split('\n').slice(1, 5).join(' | ') ?? ''),
    };
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
