/**
 * Static guitar chord voicing lookup.
 * Each entry maps a chord name to its guitar fingering data for SVG rendering.
 *
 * Format:
 *   fingers: [string, fret, finger_number] — 1-indexed string (1=high E, 6=low E)
 *   barres: [{from, to, fret}] — barre across strings
 *   baseFret: starting fret position (1 = open position)
 *   muted: string numbers that are muted (not played)
 *   open: string numbers that are played open
 */

export interface ChordVoicing {
  fingers: [number, number, number?][];
  barres: { from: number; to: number; fret: number }[];
  baseFret: number;
  muted: number[];
  open: number[];
}

export const CHORD_VOICINGS: Record<string, ChordVoicing> = {
  // Major chords
  C: {
    fingers: [[2, 1], [4, 2], [5, 3]],
    barres: [],
    baseFret: 1,
    muted: [6],
    open: [1, 3],
  },
  "C#": {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [2, 2], [4, 3], [5, 4]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 4,
    muted: [],
    open: [],
  },
  Db: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [2, 2], [4, 3], [5, 4]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 4,
    muted: [],
    open: [],
  },
  D: {
    fingers: [[1, 2], [3, 2], [2, 3]],
    barres: [],
    baseFret: 1,
    muted: [5, 6],
    open: [4],
  },
  "D#": {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [2, 2], [4, 3], [5, 4]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 6,
    muted: [],
    open: [],
  },
  Eb: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [2, 2], [4, 3], [5, 4]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 6,
    muted: [],
    open: [],
  },
  E: {
    fingers: [[3, 1], [5, 2], [4, 2]],
    barres: [],
    baseFret: 1,
    muted: [],
    open: [1, 2, 6],
  },
  F: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [3, 2], [5, 3], [4, 3]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 1,
    muted: [],
    open: [],
  },
  "F#": {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [3, 2], [5, 3], [4, 3]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 2,
    muted: [],
    open: [],
  },
  Gb: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [3, 2], [5, 3], [4, 3]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 2,
    muted: [],
    open: [],
  },
  G: {
    fingers: [[5, 2], [6, 3], [1, 3]],
    barres: [],
    baseFret: 1,
    muted: [],
    open: [2, 3, 4],
  },
  "G#": {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [3, 2], [5, 3], [4, 3]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 4,
    muted: [],
    open: [],
  },
  Ab: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [3, 2], [5, 3], [4, 3]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 4,
    muted: [],
    open: [],
  },
  A: {
    fingers: [[4, 2], [3, 2], [2, 2]],
    barres: [],
    baseFret: 1,
    muted: [6],
    open: [1, 5],
  },
  "A#": {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [2, 2], [4, 3], [5, 4]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 1,
    muted: [],
    open: [],
  },
  Bb: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [2, 2], [4, 3], [5, 4]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 1,
    muted: [],
    open: [],
  },
  B: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [2, 2], [4, 3], [5, 4]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 2,
    muted: [],
    open: [],
  },

  // Minor chords
  Cm: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [4, 3], [5, 4]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 3,
    muted: [],
    open: [],
  },
  "C#m": {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [4, 3], [5, 4]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 4,
    muted: [],
    open: [],
  },
  Dbm: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [4, 3], [5, 4]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 4,
    muted: [],
    open: [],
  },
  Dm: {
    fingers: [[1, 1], [3, 2], [2, 3]],
    barres: [],
    baseFret: 1,
    muted: [5, 6],
    open: [4],
  },
  "D#m": {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [4, 3], [5, 4]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 6,
    muted: [],
    open: [],
  },
  Ebm: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [4, 3], [5, 4]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 6,
    muted: [],
    open: [],
  },
  Em: {
    fingers: [[5, 2], [4, 2]],
    barres: [],
    baseFret: 1,
    muted: [],
    open: [1, 2, 3, 6],
  },
  Fm: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [5, 3], [4, 3]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 1,
    muted: [],
    open: [],
  },
  "F#m": {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [5, 3], [4, 3]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 2,
    muted: [],
    open: [],
  },
  Gbm: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [5, 3], [4, 3]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 2,
    muted: [],
    open: [],
  },
  Gm: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [5, 3], [4, 3]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 3,
    muted: [],
    open: [],
  },
  "G#m": {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [5, 3], [4, 3]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 4,
    muted: [],
    open: [],
  },
  Abm: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [5, 3], [4, 3]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 4,
    muted: [],
    open: [],
  },
  Am: {
    fingers: [[2, 1], [4, 2], [3, 2]],
    barres: [],
    baseFret: 1,
    muted: [6],
    open: [1, 5],
  },
  "A#m": {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [4, 3], [5, 4]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 1,
    muted: [],
    open: [],
  },
  Bbm: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [4, 3], [5, 4]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 1,
    muted: [],
    open: [],
  },
  Bm: {
    fingers: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [4, 3], [5, 4]],
    barres: [{ from: 6, to: 1, fret: 1 }],
    baseFret: 2,
    muted: [],
    open: [],
  },
};

/**
 * Look up a chord voicing by name.
 * Handles common aliases (e.g. "Amin" -> "Am", "Cmaj" -> "C").
 */
export function getChordVoicing(chordName: string): ChordVoicing | null {
  // Direct lookup
  if (CHORD_VOICINGS[chordName]) return CHORD_VOICINGS[chordName];

  // Normalize: remove "maj" suffix, convert "min" to "m"
  let normalized = chordName
    .replace(/maj$/i, "")
    .replace(/min$/i, "m")
    .replace(/minor$/i, "m")
    .replace(/major$/i, "");

  if (CHORD_VOICINGS[normalized]) return CHORD_VOICINGS[normalized];

  // Try with sharp/flat conversions
  const sharpToFlat: Record<string, string> = {
    "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb",
  };
  const flatToSharp: Record<string, string> = {
    Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#",
  };

  const root = normalized.match(/^[A-G][#b]?/)?.[0] || "";
  const suffix = normalized.slice(root.length);

  if (sharpToFlat[root]) {
    const alt = sharpToFlat[root] + suffix;
    if (CHORD_VOICINGS[alt]) return CHORD_VOICINGS[alt];
  }
  if (flatToSharp[root]) {
    const alt = flatToSharp[root] + suffix;
    if (CHORD_VOICINGS[alt]) return CHORD_VOICINGS[alt];
  }

  return null;
}
