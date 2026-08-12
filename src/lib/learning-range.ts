import type { TabNote } from "./database.types";
import { buildMusicalPhrases } from "./solo-phrases";

export type LearningRange = {
  start: number;
  end: number;
};

export const MIN_LEARNING_RANGE_SECONDS = 2;

const START_LEAD_IN = 0.2;
const END_TAIL = 0.3;
const SNAP_WINDOW_SECONDS = 0.45;

function roundTime(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function defaultLearningRangeForSection(
  sectionStart: number,
  sectionEnd: number,
): LearningRange {
  return {
    start: sectionStart,
    end: sectionEnd,
  };
}

export function clampLearningRange(
  range: LearningRange,
  sectionStart: number,
  sectionEnd: number,
  changedBoundary: "start" | "end",
): LearningRange {
  const sectionDuration = Math.max(0, sectionEnd - sectionStart);
  const minimumDuration = Math.min(MIN_LEARNING_RANGE_SECONDS, sectionDuration);
  let start = clamp(range.start, sectionStart, sectionEnd);
  let end = clamp(range.end, sectionStart, sectionEnd);

  if (end - start < minimumDuration) {
    if (changedBoundary === "start") {
      start = Math.max(sectionStart, end - minimumDuration);
    } else {
      end = Math.min(sectionEnd, start + minimumDuration);
    }
  }

  return {
    start: clamp(roundTime(start), sectionStart, sectionEnd),
    end: clamp(roundTime(end), sectionStart, sectionEnd),
  };
}

function nearestBoundary(value: number, candidates: number[]) {
  let nearest = value;
  let distance = SNAP_WINDOW_SECONDS;
  for (const candidate of candidates) {
    const nextDistance = Math.abs(candidate - value);
    if (nextDistance <= distance) {
      nearest = candidate;
      distance = nextDistance;
    }
  }
  return nearest;
}

export function snapLearningRange(
  range: LearningRange,
  notes: TabNote[],
  sectionStart: number,
  sectionEnd: number,
): LearningRange {
  const notesInSection = notes.filter(
    (note) =>
      note.start_time >= sectionStart && note.start_time < sectionEnd,
  );
  const startCandidates = notesInSection.map((note) =>
    Math.max(sectionStart, note.start_time - START_LEAD_IN),
  );
  const endCandidates = notesInSection.map((note) =>
    Math.min(
      sectionEnd,
      note.start_time + Math.max(0, note.duration) + END_TAIL,
    ),
  );

  const snappedStart = nearestBoundary(range.start, [
    sectionStart,
    ...startCandidates,
  ]);
  const snappedEnd = nearestBoundary(range.end, [
    ...endCandidates,
    sectionEnd,
  ]);

  return clampLearningRange(
    { start: snappedStart, end: snappedEnd },
    sectionStart,
    sectionEnd,
    "end",
  );
}

export function buildLearningRangeSuggestions(
  notes: TabNote[],
  sectionStart: number,
  sectionEnd: number,
  bpm: number | null,
): LearningRange[] {
  const beatDuration = bpm && bpm > 0 ? 60 / bpm : 0.5;
  const phrases = buildMusicalPhrases(notes, sectionStart, sectionEnd, {
    minimumDuration: 2.5,
    maximumDuration: 7,
    pauseThreshold: Math.max(0.28, beatDuration * 0.55),
    leadIn: Math.min(0.5, beatDuration * 0.75),
    tail: Math.min(0.65, beatDuration),
  }).map((range) =>
    snapLearningRange(range, notes, sectionStart, sectionEnd),
  );

  if (phrases.length > 0) {
    const validated: LearningRange[] = [];
    for (const phrase of phrases) {
      if (
        passesLearningRangeAccuracyGate(
          phrase,
          notes,
          sectionStart,
          sectionEnd,
        )
      ) {
        validated.push(phrase);
        continue;
      }

      const previous = validated.at(-1);
      if (!previous) continue;
      const merged = snapLearningRange(
        { start: previous.start, end: phrase.end },
        notes,
        sectionStart,
        sectionEnd,
      );
      if (
        passesLearningRangeAccuracyGate(
          merged,
          notes,
          sectionStart,
          sectionEnd,
        )
      ) {
        validated[validated.length - 1] = merged;
      }
    }
    if (validated.length > 0) return validated;
  }
  if (sectionEnd <= sectionStart) return [];
  return [
    clampLearningRange(
      { start: sectionStart, end: Math.min(sectionEnd, sectionStart + 7) },
      sectionStart,
      sectionEnd,
      "end",
    ),
  ];
}

export function passesLearningRangeAccuracyGate(
  range: LearningRange | null,
  notes: TabNote[],
  sectionStart: number,
  sectionEnd: number,
) {
  if (!range) return false;
  const duration = range.end - range.start;
  if (
    range.start < sectionStart ||
    range.end > sectionEnd ||
    duration < Math.min(MIN_LEARNING_RANGE_SECONDS, sectionEnd - sectionStart)
  ) {
    return false;
  }

  const containsGuitar = notes.some(
    (note) => note.start_time >= range.start && note.start_time < range.end,
  );
  if (!containsGuitar) return false;

  const snapped = snapLearningRange(range, notes, sectionStart, sectionEnd);
  return (
    Math.abs(snapped.start - range.start) <= 0.11 &&
    Math.abs(snapped.end - range.end) <= 0.11
  );
}
