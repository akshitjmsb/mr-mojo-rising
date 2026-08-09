export type Finger = 1 | 2 | 3 | 4;

export type ChordShape = {
  frets: readonly (number | null)[];
  fingers: readonly (Finger | null)[];
  tip: string;
};

export const OPEN_CHORD_SHAPES: Readonly<Record<string, ChordShape>> = {
  C: {
    frets: [null, 3, 2, 0, 1, 0],
    fingers: [null, 3, 2, null, 1, null],
    tip: "Let the open G and high E strings ring.",
  },
  G: {
    frets: [3, 2, 0, 0, 0, 3],
    fingers: [2, 1, null, null, null, 3],
    tip: "Keep your fingers curved so the middle strings stay open.",
  },
  A7: {
    frets: [null, 0, 2, 0, 2, 0],
    fingers: [null, null, 1, null, 2, null],
    tip: "Use only two fingers and let the open strings ring.",
  },
  D: {
    frets: [null, null, 0, 2, 3, 2],
    fingers: [null, null, null, 1, 3, 2],
    tip: "Start your strum on the open D string.",
  },
  A: {
    frets: [null, 0, 2, 2, 2, 0],
    fingers: [null, null, 1, 2, 3, null],
    tip: "Keep all three fingers close to the second fret.",
  },
  Am7: {
    frets: [null, 0, 2, 0, 1, 0],
    fingers: [null, null, 2, null, 1, null],
    tip: "This is an Am shape with the ring finger lifted.",
  },
  Am: {
    frets: [null, 0, 2, 2, 1, 0],
    fingers: [null, null, 2, 3, 1, null],
    tip: "Keep the high E open and avoid the low E.",
  },
  E: {
    frets: [0, 2, 2, 1, 0, 0],
    fingers: [null, 2, 3, 1, null, null],
    tip: "Strum all six strings and keep both E strings open.",
  },
  Em: {
    frets: [0, 2, 2, 0, 0, 0],
    fingers: [null, 1, 2, null, null, null],
    tip: "Use two fingers and let all six strings ring.",
  },
  D7: {
    frets: [null, null, 0, 2, 1, 2],
    fingers: [null, null, null, 2, 1, 3],
    tip: "Start on the D string and make a small triangle.",
  },
  E7: {
    frets: [0, 2, 0, 1, 0, 0],
    fingers: [null, 2, null, 1, null, null],
    tip: "This is an E shape with the ring finger lifted.",
  },
};

export function getChordShape(chord: string) {
  return OPEN_CHORD_SHAPES[chord] ?? null;
}
