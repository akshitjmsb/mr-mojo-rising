export interface GuitarString {
  name: string;
  frequency: number;
  midi: number;
}

export interface Tuning {
  id: string;
  label: string;
  description: string;
  strings: GuitarString[];
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
];

const A4_MIDI = 69;
const A4_FREQ = 440;

export function midiToFrequency(midi: number) {
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}

export function midiToName(midi: number) {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${octave}`;
}

function note(name: string, midi: number): GuitarString {
  return { name, midi, frequency: midiToFrequency(midi) };
}

export const EB_BASS_TUNING: Tuning = {
  id: "eb-bass",
  label: "E♭ Standard Bass",
  description: "E♭ A♭ D♭ G♭",
  strings: [
    note("E♭1", 27),
    note("A♭1", 32),
    note("D♭2", 37),
    note("G♭2", 42),
  ],
};

// MIDI numbers for standard guitar (low to high): E2=40, A2=45, D3=50, G3=55, B3=59, E4=64
export const TUNINGS: Tuning[] = [
  {
    id: "standard",
    label: "Standard",
    description: "E A D G B E",
    strings: [
      note("E2", 40),
      note("A2", 45),
      note("D3", 50),
      note("G3", 55),
      note("B3", 59),
      note("E4", 64),
    ],
  },
  {
    id: "eb-standard",
    label: "E♭ Standard",
    description: "E♭ A♭ D♭ G♭ B♭ E♭",
    strings: [
      note("E♭2", 39),
      note("A♭2", 44),
      note("D♭3", 49),
      note("G♭3", 54),
      note("B♭3", 58),
      note("E♭4", 63),
    ],
  },
  {
    id: "drop-d",
    label: "Drop D",
    description: "D A D G B E",
    strings: [
      note("D2", 38),
      note("A2", 45),
      note("D3", 50),
      note("G3", 55),
      note("B3", 59),
      note("E4", 64),
    ],
  },
  {
    id: "open-g",
    label: "Open G",
    description: "D G D G B D",
    strings: [
      note("D2", 38),
      note("G2", 43),
      note("D3", 50),
      note("G3", 55),
      note("B3", 59),
      note("D4", 62),
    ],
  },
  {
    id: "dadgad",
    label: "DADGAD",
    description: "D A D G A D",
    strings: [
      note("D2", 38),
      note("A2", 45),
      note("D3", 50),
      note("G3", 55),
      note("A3", 57),
      note("D4", 62),
    ],
  },
  EB_BASS_TUNING,
];

export function frequencyToMidi(freq: number) {
  return 12 * Math.log2(freq / A4_FREQ) + A4_MIDI;
}

/**
 * Cents from `frequency` to a target frequency. Positive = sharp, negative = flat.
 */
export function centsBetween(frequency: number, target: number) {
  return 1200 * Math.log2(frequency / target);
}

/**
 * Cents from `frequency` to `target`, folded to the nearest octave. Use when
 * the target string is fixed (pinned) so a harmonic still reads as a small
 * offset from that string rather than ±1200¢.
 */
export function centsToTargetFolded(frequency: number, target: number) {
  const base = centsBetween(frequency, target);
  return base - Math.round(base / 1200) * 1200;
}

export interface MatchResult {
  string: GuitarString;
  cents: number;
  index: number;
}

/**
 * Closest string in the tuning to `frequency`. Automatic identification only
 * tolerates a one-octave detector error: folding every octave would make E2
 * and E4 indistinguishable. A manually pinned string can use the broader
 * `centsToTargetFolded` harmonic tolerance safely.
 */
export function closestString(
  frequency: number,
  tuning: Tuning,
): MatchResult | null {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  let best: MatchResult | null = null;
  for (let i = 0; i < tuning.strings.length; i++) {
    const s = tuning.strings[i];
    const base = centsBetween(frequency, s.frequency);
    const cents = [base, base - 1200, base + 1200].reduce((closest, value) =>
      Math.abs(value) < Math.abs(closest) ? value : closest,
    );
    if (best === null || Math.abs(cents) < Math.abs(best.cents)) {
      best = { string: s, cents, index: i };
    }
  }
  return best;
}
