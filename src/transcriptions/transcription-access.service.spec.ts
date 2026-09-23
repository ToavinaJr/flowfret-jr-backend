import { TranscriptionStatus } from '@prisma/client';
import {
  createTranscriptionFixture,
  transcriptionRecord,
} from './transcription-test.factory';

describe('TranscriptionAccessService', () => {
  it('hides records from users without access', async () => {
    const { access, repository } =
      createTranscriptionFixture(transcriptionRecord);
    repository.hasAccess.mockResolvedValue(false);

    await expect(
      access.get(transcriptionRecord.id, 'another-user'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns no job id for a completed transcription', async () => {
    const { access } = createTranscriptionFixture({
      ...transcriptionRecord,
      status: TranscriptionStatus.COMPLETED,
    });

    await expect(
      access.get(transcriptionRecord.id, 'user'),
    ).resolves.toMatchObject({ cached: true, jobId: null });
  });

  it.each([
    [TranscriptionStatus.COMPLETED, false, 'transcription.completed'],
    [TranscriptionStatus.FAILED, false, 'transcription.failed'],
    [TranscriptionStatus.PROCESSING, true, 'transcription.ready-to-play'],
    [TranscriptionStatus.PROCESSING, false, 'transcription.progress'],
  ])(
    'maps %s status to the correct snapshot event',
    async (status, ready, type) => {
      const { access } = createTranscriptionFixture({
        ...transcriptionRecord,
        status,
        readyToPlay: ready,
      });

      await expect(
        access.snapshot(transcriptionRecord.id, 'user'),
      ).resolves.toMatchObject({ type });
    },
  );

  it('rejects an LRC export before content is available', async () => {
    const { access } = createTranscriptionFixture(transcriptionRecord);

    await expect(
      access.lrc(transcriptionRecord.id, 'user'),
    ).rejects.toMatchObject({
      response: { code: 'TRANSCRIPTION_NOT_READY' },
    });
  });

  it('creates a filesystem-safe LRC filename', async () => {
    const { access } = createTranscriptionFixture({
      ...transcriptionRecord,
      title: 'Été / Live',
      artist: 'Artiste & amis',
      lrcContent: '[00:00.00]Bonjour',
    });

    await expect(access.lrc(transcriptionRecord.id, 'user')).resolves.toEqual({
      content: '[00:00.00]Bonjour',
      filename: 'Ete-Live-Artiste-amis.lrc',
    });
  });
});
