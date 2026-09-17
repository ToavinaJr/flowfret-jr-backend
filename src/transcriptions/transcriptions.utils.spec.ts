import {
  buildTranscriptionJobId,
  isSegment,
  parseWorkerMessage,
  secondsToLrcTimestamp,
} from './transcriptions.utils';

describe('transcription utilities', () => {
  it('builds deterministic cache-safe job ids', () => {
    expect(buildTranscriptionJobId('track', undefined, 'small', '1')).toBe(
      buildTranscriptionJobId('track', undefined, 'small', '1'),
    );
    expect(buildTranscriptionJobId('track', 'fr', 'small', '1')).not.toBe(
      buildTranscriptionJobId('track', 'en', 'small', '1'),
    );
  });
  it('formats LRC timestamps beyond 59 minutes', () => {
    expect(secondsToLrcTimestamp(3661.239)).toBe('61:01.24');
  });
  it('validates strict worker segments', () => {
    expect(
      isSegment({ id: 's1', start: 0, end: 1, text: 'line', words: [] }),
    ).toBe(true);
    expect(() =>
      parseWorkerMessage('{"type":"segment","segment":{"id":"x"}}'),
    ).toThrow('Invalid worker message');
  });
  it('accepts model lifecycle worker messages', () => {
    expect(parseWorkerMessage('{"type":"model-loading"}')).toEqual({
      type: 'model-loading',
    });
    expect(parseWorkerMessage('{"type":"model-ready"}')).toEqual({
      type: 'model-ready',
    });
  });
});
