import type { TabNote } from "./database.types";

export const PRACTICE_TUNINGS = [
  {
    id: "standard",
    name: "Standard",
    offset: 0,
    chordShapeShift: 0,
    strings: ["E", "A", "D", "G", "B", "E"],
  },
  {
    id: "eb-standard",
    name: "E♭ Standard",
    offset: -1,
    chordShapeShift: 1,
    strings: ["E♭", "A♭", "D♭", "G♭", "B♭", "E♭"],
  },
  {
    id: "d-standard",
    name: "D Standard",
    offset: -2,
    chordShapeShift: 2,
    strings: ["D", "G", "C", "F", "A", "D"],
  },
] as const;

export type PracticeTuningId = (typeof PRACTICE_TUNINGS)[number]["id"];

const SONG_TUNING_IDS: Record<string, PracticeTuningId> = {
  "345fde6a-1c25-4921-9db1-baf7e8d24ad2": "eb-standard",
};

export function getPracticeTuning(id: string) {
  return (
    PRACTICE_TUNINGS.find((tuning) => tuning.id === id) ??
    PRACTICE_TUNINGS[0]
  );
}

export function getSongPracticeTuning(songId: string, fallbackId: string) {
  return getPracticeTuning(SONG_TUNING_IDS[songId] ?? fallbackId);
}

const NOTE_NAMES = [
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

const NOTE_INDEX: Record<string, number> = {
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

/** Transpose a normalized chord label while preserving its quality suffix. */
export function transposeChord(chord: string, semitones: number) {
  const match = chord.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!match || semitones === 0) return chord;
  const index = NOTE_INDEX[match[1]];
  if (index === undefined) return chord;
  const shifted = (index + semitones + NOTE_NAMES.length) % NOTE_NAMES.length;
  return `${NOTE_NAMES[shifted]}${match[2]}`;
}

const STANDARD_OPEN_MIDI = [64, 59, 55, 50, 45, 40];
const MAX_FRET = 24;

type Position = readonly [stringNumber: number, fret: number];

function candidates(pitch: number, tuningOffset: number): Position[] {
  const positions: Position[] = [];
  for (let index = 0; index < STANDARD_OPEN_MIDI.length; index++) {
    const fret = pitch - (STANDARD_OPEN_MIDI[index] + tuningOffset);
    if (fret >= 0 && fret <= MAX_FRET) positions.push([index + 1, fret]);
  }
  return positions;
}

function localCost(fret: number) {
  if (fret === 0) return 0;
  return 0.1 + fret * 0.03 + Math.max(0, fret - 12) * 0.4;
}

function transitionCost(previous: Position, current: Position, gap: number) {
  const fretDistance =
    previous[1] > 0 && current[1] > 0
      ? Math.abs(current[1] - previous[1])
      : 0;
  const stringDistance = Math.abs(current[0] - previous[0]);
  const decay = Math.exp(-Math.max(gap, 0) / 1.5);
  return (fretDistance + stringDistance * 0.25) * decay;
}

/**
 * Reposition detected pitches for a uniformly lowered guitar tuning. The
 * detector stores concert MIDI pitch; this pass converts it into the physical
 * string/fret positions the learner should play.
 */
export function positionNotesForTuning(
  notes: TabNote[],
  tuningOffset: number,
): TabNote[] {
  if (tuningOffset === 0 || notes.length === 0) return notes;

  const playable = notes
    .map((note) => ({ note, positions: candidates(note.midi_pitch, tuningOffset) }))
    .filter((entry) => entry.positions.length > 0);
  if (playable.length === 0) return [];

  const costs: Array<Array<{ cost: number; previous: number }>> = [
    playable[0].positions.map((position) => ({
      cost: localCost(position[1]),
      previous: -1,
    })),
  ];

  for (let index = 1; index < playable.length; index++) {
    const gap = Math.max(
      0,
      playable[index].note.start_time - playable[index - 1].note.start_time,
    );
    costs.push(
      playable[index].positions.map((current) => {
        let bestCost = Number.POSITIVE_INFINITY;
        let bestPrevious = -1;
        playable[index - 1].positions.forEach((previous, previousIndex) => {
          const cost =
            costs[index - 1][previousIndex].cost +
            transitionCost(previous, current, gap);
          if (cost < bestCost) {
            bestCost = cost;
            bestPrevious = previousIndex;
          }
        });
        return {
          cost: bestCost + localCost(current[1]),
          previous: bestPrevious,
        };
      }),
    );
  }

  let stateIndex = costs.at(-1)!.reduce(
    (best, state, index, states) =>
      state.cost < states[best].cost ? index : best,
    0,
  );
  const chosen = new Array<number>(playable.length);
  for (let index = playable.length - 1; index >= 0; index--) {
    chosen[index] = stateIndex;
    stateIndex = costs[index][stateIndex].previous;
  }

  const positioned = playable.map(({ note, positions }, index) => ({
    ...note,
    string_num: positions[chosen[index]][0],
    fret: positions[chosen[index]][1],
  }));

  for (let index = 0; index < positioned.length; index++) {
    const usedStrings = new Set([positioned[index].string_num]);
    for (
      let next = index + 1;
      next < positioned.length &&
      positioned[next].start_time - positioned[index].start_time <= 0.04;
      next++
    ) {
      if (usedStrings.has(positioned[next].string_num)) {
        const alternative = candidates(
          positioned[next].midi_pitch,
          tuningOffset,
        ).find(([stringNumber]) => !usedStrings.has(stringNumber));
        if (alternative) {
          positioned[next].string_num = alternative[0];
          positioned[next].fret = alternative[1];
        }
      }
      usedStrings.add(positioned[next].string_num);
    }
  }

  return positioned;
}
