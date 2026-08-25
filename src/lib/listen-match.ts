import type { RhythmChordChange } from "./rhythm-chords";

export type ListenMatchPhrase = {
  start: number;
  end: number;
  changes: RhythmChordChange[];
};

export type ChromaFrame = {
  time: number;
  rms: number;
  chroma: number[];
};

export type RhythmTakeResult = {
  outcome: "passed" | "retry" | "withheld";
  message: string;
  signalCoverage: number;
  score: number;
  targetChord: string | null;
};

type ChordTemplate = {
  label: string;
  root: number;
  tones: number[];
  vector: number[];
};

const ROOTS: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const CANONICAL_ROOTS = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

const CORE_INTERVALS: Record<string, number[]> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
};

const INTERVAL_WEIGHTS: Record<number, number> = {
  0: 1,
  2: 0.85,
  3: 0.9,
  4: 0.9,
  5: 0.85,
  6: 0.72,
  7: 0.78,
  8: 0.72,
};

const MIN_SIGNAL_RMS = 0.012;
const MIN_SIGNAL_COVERAGE = 0.45;
const MIN_ACOUSTIC_SCORE = 0.62;
const MIN_SCORE_MARGIN = 0.02;
const MIN_FRAME_STABILITY = 0.5;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeChroma(chroma: number[]) {
  const positive = chroma.map((value) => Math.max(0, value));
  const total = positive.reduce((sum, value) => sum + value, 0);
  return total > 1e-12
    ? positive.map((value) => value / total)
    : new Array<number>(12).fill(0);
}

function templateVector(root: number, intervals: number[]) {
  const tones = intervals.map((interval) => (root + interval) % 12);
  const vector = new Array<number>(12).fill(0);
  intervals.forEach((interval, index) => {
    vector[tones[index]] = INTERVAL_WEIGHTS[interval] ?? 0.7;
  });
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return {
    tones,
    vector: norm > 0 ? vector.map((value) => value / norm) : vector,
  };
}

function coreQuality(rawQuality: string) {
  const quality = rawQuality.replace(/[()]/g, "").toLowerCase();
  if (quality.startsWith("sus2")) return "sus2";
  if (quality.startsWith("sus")) return "sus4";
  if (quality.startsWith("dim") || quality.startsWith("°")) return "dim";
  if (quality.startsWith("aug") || quality.startsWith("+")) return "aug";
  if (quality.startsWith("m") && !quality.startsWith("maj")) return "m";
  return "";
}

export function chordTemplate(
  label: string,
  concertPitchOffset = 0,
): ChordTemplate | null {
  const normalized = label.replaceAll("♭", "b").replaceAll("♯", "#").trim();
  const match = normalized.match(/^([A-G](?:#|b)?)([^/]*)/);
  if (!match) return null;
  const root = ROOTS[match[1]];
  if (root === undefined) return null;
  const quality = coreQuality(match[2]);
  const intervals = CORE_INTERVALS[quality];
  if (!intervals) return null;
  const shiftedRoot = (root + concertPitchOffset + 120) % 12;
  const { tones, vector } = templateVector(shiftedRoot, intervals);
  return {
    label: `${CANONICAL_ROOTS[shiftedRoot]}${quality}`,
    root: shiftedRoot,
    tones,
    vector,
  };
}

const ALL_CORE_TEMPLATES = CANONICAL_ROOTS.flatMap((rootName) =>
  Object.keys(CORE_INTERVALS).map((quality) =>
    chordTemplate(`${rootName}${quality}`),
  ),
).filter((template): template is ChordTemplate => template !== null);

function scoreTemplate(chroma: number[], template: ChordTemplate) {
  const normalized = normalizeChroma(chroma);
  const support = template.tones.reduce(
    (sum, pitchClass) => sum + normalized[pitchClass],
    0,
  );
  const chromaNorm = Math.sqrt(
    normalized.reduce((sum, value) => sum + value * value, 0),
  );
  const cosine = chromaNorm
    ? normalized.reduce(
        (sum, value, index) => sum + value * template.vector[index],
        0,
      ) / chromaNorm
    : 0;
  return clamp(0.55 * support + 0.45 * cosine, 0, 1);
}

function sameHarmony(left: ChordTemplate, right: ChordTemplate) {
  return (
    left.root === right.root &&
    left.tones.length === right.tones.length &&
    left.tones.every((tone) => right.tones.includes(tone))
  );
}

export function buildListenMatchPhrase(
  changes: RhythmChordChange[],
  selection: { start: number; end: number },
  maximumDuration = 6,
): ListenMatchPhrase | null {
  const verified = changes
    .filter(
      (change) =>
        change.verified &&
        change.end > selection.start &&
        change.start < selection.end,
    )
    .sort((left, right) => left.start - right.start);
  const first = verified[0];
  if (!first) return null;

  const start = Math.max(selection.start, first.start);
  const end = Math.min(selection.end, start + Math.max(2, maximumDuration));
  if (end - start < 1) return null;

  const phraseChanges = verified
    .filter((change) => change.end > start && change.start < end)
    .map((change) => ({
      ...change,
      start: Math.max(start, change.start),
      end: Math.min(end, change.end),
    }))
    .filter((change) => change.end - change.start >= 0.35);

  return phraseChanges.length > 0 ? { start, end, changes: phraseChanges } : null;
}

export function frequencyDataToChroma(
  decibels: Float32Array,
  sampleRate: number,
  fftSize: number,
) {
  const chroma = new Array<number>(12).fill(0);
  let peakDb = Number.NEGATIVE_INFINITY;
  for (const value of decibels) {
    if (Number.isFinite(value)) peakDb = Math.max(peakDb, value);
  }
  if (!Number.isFinite(peakDb)) return chroma;

  const floorDb = Math.max(-92, peakDb - 38);
  for (let bin = 1; bin < decibels.length; bin++) {
    const db = decibels[bin];
    if (!Number.isFinite(db) || db < floorDb) continue;
    const frequency = (bin * sampleRate) / fftSize;
    if (frequency < 65 || frequency > 1500) continue;
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    const pitchClass = ((midi % 12) + 12) % 12;
    const magnitude = 10 ** ((db - peakDb) / 20);
    chroma[pitchClass] += magnitude / Math.sqrt(Math.max(1, frequency / 110));
  }
  return normalizeChroma(chroma);
}

function assessChord(
  label: string,
  chroma: number[],
  frames: ChromaFrame[],
  tuningOffset: number,
) {
  const candidate = chordTemplate(label, tuningOffset);
  if (!candidate) return null;
  const ranked = ALL_CORE_TEMPLATES.map((template) => ({
    template,
    score: scoreTemplate(chroma, template),
  })).sort((left, right) => right.score - left.score);
  const candidateScore = scoreTemplate(chroma, candidate);
  const best = ranked[0];
  const runnerUp = ranked.find(
    ({ template }) => !sameHarmony(candidate, template),
  );
  const margin = candidateScore - (runnerUp?.score ?? 0);
  const stableFrames = frames.filter((frame) => {
    const frameScore = scoreTemplate(frame.chroma, candidate);
    const bestFrameScore = Math.max(
      ...ALL_CORE_TEMPLATES.map((template) =>
        scoreTemplate(frame.chroma, template),
      ),
    );
    return frameScore >= MIN_ACOUSTIC_SCORE - 0.06 && frameScore >= bestFrameScore - 0.035;
  }).length;
  const stability = frames.length > 0 ? stableFrames / frames.length : 0;
  return {
    candidateScore,
    margin,
    stability,
    bestMatches: sameHarmony(candidate, best.template),
    passed:
      sameHarmony(candidate, best.template) &&
      candidateScore >= MIN_ACOUSTIC_SCORE &&
      margin >= MIN_SCORE_MARGIN &&
      stability >= MIN_FRAME_STABILITY,
  };
}

export function evaluateRhythmTake(
  phrase: ListenMatchPhrase,
  frames: ChromaFrame[],
  tuningOffset = 0,
): RhythmTakeResult {
  const assessments: Array<{
    change: RhythmChordChange;
    score: number;
    stability: number;
    passed: boolean;
  }> = [];
  let eligibleFrames = 0;
  let signalFrames = 0;

  for (const change of phrase.changes) {
    const relativeStart = change.start - phrase.start;
    const relativeEnd = change.end - phrase.start;
    const trim = Math.min(0.12, (relativeEnd - relativeStart) * 0.08);
    const window = frames.filter(
      (frame) =>
        frame.time >= relativeStart + trim &&
        frame.time <= relativeEnd - trim,
    );
    eligibleFrames += window.length;
    const signal = window.filter(
      (frame) =>
        frame.rms >= MIN_SIGNAL_RMS &&
        frame.chroma.some((value) => value > 0),
    );
    signalFrames += signal.length;
    if (signal.length < 4) {
      assessments.push({ change, score: 0, stability: 0, passed: false });
      continue;
    }

    const aggregate = normalizeChroma(
      new Array<number>(12).fill(0).map((_, pitchClass) =>
        signal.reduce(
          (sum, frame) => sum + (frame.chroma[pitchClass] ?? 0),
          0,
        ),
      ),
    );
    const assessment = assessChord(
      change.label,
      aggregate,
      signal,
      tuningOffset,
    );
    assessments.push({
      change,
      score: assessment?.candidateScore ?? 0,
      stability: assessment?.stability ?? 0,
      passed: assessment?.passed ?? false,
    });
  }

  const signalCoverage = eligibleFrames > 0 ? signalFrames / eligibleFrames : 0;
  const score =
    assessments.length > 0
      ? assessments.reduce((sum, item) => sum + item.score, 0) /
        assessments.length
      : 0;

  if (eligibleFrames < 4 || signalCoverage < MIN_SIGNAL_COVERAGE) {
    return {
      outcome: "withheld",
      message: "I could not hear enough guitar. Move closer and try again.",
      signalCoverage,
      score,
      targetChord: null,
    };
  }

  if (assessments.length > 0 && assessments.every((item) => item.passed)) {
    return {
      outcome: "passed",
      message: "Matched. You are ready to play this phrase with the song.",
      signalCoverage,
      score,
      targetChord: null,
    };
  }

  const target = [...assessments].sort(
    (left, right) =>
      left.score + left.stability - (right.score + right.stability),
  )[0];
  const timingNeedsWork = target && target.score >= MIN_ACOUSTIC_SCORE;
  return {
    outcome: "retry",
    message: target
      ? timingNeedsWork
        ? `Hold ${target.change.label} through the full change.`
        : `I could not confirm ${target.change.label}. Hear it once more, then retry.`
      : "I could not confirm this take. Hear it once more, then retry.",
    signalCoverage,
    score,
    targetChord: target?.change.label ?? null,
  };
}
