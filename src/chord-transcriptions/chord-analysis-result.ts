export interface ChordAnalysisResult {
  duration: number;
  cues: { start: number; end: number; chord: string }[];
  beats: number[];
  downbeats: number[];
  engineVersion: string;
}

export function parseChordAnalysisResult(value: unknown): ChordAnalysisResult {
  if (!value || typeof value !== 'object') throw new Error('Invalid analysis');
  const result = value as Partial<ChordAnalysisResult>;
  if (typeof result.duration !== 'number' || !Number.isFinite(result.duration) || result.duration <= 0 || result.duration > 900 ||
      result.engineVersion !== 'btc-beat-this-v1' || !Array.isArray(result.cues) || result.cues.length === 0 || result.cues.length > 20000) {
    throw new Error('Invalid analysis');
  }
  let previousEnd = 0;
  const cues = result.cues.map((cue) => {
    if (!cue || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < previousEnd ||
        cue.end <= cue.start || cue.end > result.duration! + 0.01 || typeof cue.chord !== 'string' || cue.chord.length > 32) {
      throw new Error('Invalid chord timeline');
    }
    previousEnd = cue.end;
    return { start: cue.start, end: cue.end, chord: cue.chord };
  });
  const readBeats = (beats: unknown): number[] => {
    if (!Array.isArray(beats) || beats.length > 10000) throw new Error('Invalid beats');
    let previous = -1;
    return beats.map((beat: unknown) => {
      if (typeof beat !== 'number' || !Number.isFinite(beat) || beat < 0 || beat <= previous || beat > result.duration!) throw new Error('Invalid beats');
      previous = beat;
      return beat;
    });
  };
  return { duration: result.duration, cues, beats: readBeats(result.beats), downbeats: readBeats(result.downbeats), engineVersion: result.engineVersion };
}
