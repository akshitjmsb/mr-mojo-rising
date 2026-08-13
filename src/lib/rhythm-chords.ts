import type { Chord } from "./database.types";
import { transposeChord } from "./guitar";

export type RhythmChordChange = {
  id: string;
  label: string;
  start: number;
  end: number;
};

const NON_CHORD = /^(n|n\.c\.|no chord|silence)$/i;

/**
 * Build a truthful chord-change lane for a selected practice range. Repeated
 * detections of the same harmony are merged; time is never compressed.
 */
export function buildRhythmChordChanges(
  chords: Chord[],
  rangeStart: number,
  rangeEnd: number,
  chordShapeShift: number,
  minimumConfidence = 0.7,
): RhythmChordChange[] {
  const changes: RhythmChordChange[] = [];
  const ordered = [...chords].sort(
    (left, right) => left.start_time - right.start_time,
  );

  for (const chord of ordered) {
    if (chord.end_time <= rangeStart || chord.start_time >= rangeEnd) continue;
    if (
      chord.confidence !== null &&
      chord.confidence < minimumConfidence
    ) {
      continue;
    }

    const label = transposeChord(
      chord.chord_standard,
      chordShapeShift,
    ).trim();
    if (!label || NON_CHORD.test(label)) continue;

    const start = Math.max(rangeStart, chord.start_time);
    const end = Math.min(rangeEnd, Math.max(chord.end_time, start));
    if (end <= start) continue;

    const previous = changes.at(-1);
    if (previous?.label === label) {
      previous.end = Math.max(previous.end, end);
      continue;
    }

    changes.push({ id: chord.id, label, start, end });
  }

  changes.forEach((change, index) => {
    change.end = changes[index + 1]?.start ?? rangeEnd;
  });

  return changes;
}
