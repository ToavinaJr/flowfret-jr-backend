import type { CreateTranscriptionDto } from './dto/create-transcription.dto';
import type { TranscriptionEvent } from './entities/transcription.types';
import type { TranscriptionResponse } from './transcription.presenter';
import { TranscriptionAccessService } from './transcription-access.service';
import { TranscriptionQueueDiagnosticsService } from './transcription-queue-diagnostics.service';
import { TranscriptionWorkflowService } from './transcription-workflow.service';
import { TranscriptionsService } from './transcriptions.service';

describe('TranscriptionsService', () => {
  const response = {
    transcriptionId: 'transcription-id',
  } as unknown as TranscriptionResponse;
  const event = {
    type: 'transcription.progress',
    transcriptionId: 'transcription-id',
  } as TranscriptionEvent;
  const createOrGet = jest.fn().mockResolvedValue(response);
  const retry = jest.fn().mockResolvedValue(response);
  const get = jest.fn().mockResolvedValue(response);
  const snapshot = jest.fn().mockResolvedValue(event);
  const list = jest.fn().mockResolvedValue([response]);
  const lrc = jest
    .fn()
    .mockResolvedValue({ content: 'lrc', filename: 'track.lrc' });
  const getDiagnostics = jest.fn().mockResolvedValue({ status: 'READY' });
  const workflow = {
    createOrGet,
    retry,
  } as unknown as TranscriptionWorkflowService;
  const access = {
    get,
    snapshot,
    list,
    lrc,
  } as unknown as TranscriptionAccessService;
  const diagnostics = {
    diagnostics: getDiagnostics,
  } as unknown as TranscriptionQueueDiagnosticsService;
  const service = new TranscriptionsService(workflow, access, diagnostics);

  beforeEach(() => jest.clearAllMocks());

  it('delegates creation to the workflow service', async () => {
    const dto = { trackId: 'track' } as CreateTranscriptionDto;
    await expect(service.createOrGet(dto, 'user')).resolves.toBe(response);
    expect(createOrGet).toHaveBeenCalledWith(dto, 'user');
  });

  it('delegates reads to the access service', async () => {
    await expect(service.get('id', 'user')).resolves.toBe(response);
    expect(get).toHaveBeenCalledWith('id', 'user');
  });

  it('delegates history reads to the access service', async () => {
    await expect(service.list('user', 10)).resolves.toEqual([response]);
    expect(list).toHaveBeenCalledWith('user', 10);
  });

  it('delegates snapshots to the access service', async () => {
    await expect(service.getEventSnapshot('id', 'user')).resolves.toBe(event);
    expect(snapshot).toHaveBeenCalledWith('id', 'user');
  });

  it('delegates LRC exports to the access service', async () => {
    await expect(service.getLrc('id', 'user')).resolves.toEqual({
      content: 'lrc',
      filename: 'track.lrc',
    });
    expect(lrc).toHaveBeenCalledWith('id', 'user');
  });

  it('delegates retries to the workflow service', async () => {
    await expect(service.retry('id', 'audio-url', 'user')).resolves.toBe(
      response,
    );
    expect(retry).toHaveBeenCalledWith('id', 'audio-url', 'user');
  });

  it('delegates diagnostics to the queue diagnostics service', async () => {
    await expect(service.diagnostics()).resolves.toEqual({ status: 'READY' });
    expect(getDiagnostics).toHaveBeenCalledTimes(1);
  });
});
