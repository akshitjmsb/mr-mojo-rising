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
export const DEFAULT_REFERENCE_A = 440;
export const MIN_REFERENCE_A = 415;
export const MAX_REFERENCE_A = 466;

export function validReferenceA(value: number) {
  return Number.isFinite(value) && value >= MIN_REFERENCE_A && value <= MAX_REFERENCE_A;
}

export function midiToFrequency(midi: number, referenceA = DEFAULT_REFERENCE_A) {
  return referenceA * Math.pow(2, (midi - A4_MIDI) / 12);
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
  strings: [note("E♭1", 27), note("A♭1", 32), note("D♭2", 37), note("G♭2", 42)],
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

export function frequencyToMidi(freq: number, referenceA = DEFAULT_REFERENCE_A) {
  return 12 * Math.log2(freq / referenceA) + A4_MIDI;
}

export function tuningAtReference(tuning: Tuning, referenceA: number): Tuning {
  return { ...tuning, strings: tuning.strings.map(string => ({ ...string, frequency: midiToFrequency(string.midi, referenceA) })) };
}

export function detectedNote(frequency: number, referenceA = DEFAULT_REFERENCE_A) {
  if (!Number.isFinite(frequency) || frequency <= 0 || !validReferenceA(referenceA)) return null;
  const midi = Math.round(frequencyToMidi(frequency, referenceA));
  const target = midiToFrequency(midi, referenceA);
  return { midi, name: midiToName(midi), frequency: target, cents: centsBetween(frequency, target) };
}

/**
 * Cents from `frequency` to a target frequency. Positive = sharp, negative = flat.
 */
export function centsBetween(frequency: number, target: number) {
  return 1200 * Math.log2(frequency / target);
}

export interface MatchResult {
  string: GuitarString;
  cents: number;
  index: number;
}

/**
 * Match actual concert pitch, never an octave-folded substitute. Otherwise
 * Drop D's D3 is mistaken for D2, and a different string can appear in tune.
 */
export function closestString(
  frequency: number,
  tuning: Tuning,
): MatchResult | null {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  let best: MatchResult | null = null;
  for (let i = 0; i < tuning.strings.length; i++) {
    const s = tuning.strings[i];
    const cents = centsBetween(frequency, s.frequency);
    if (best === null || Math.abs(cents) < Math.abs(best.cents)) {
      best = { string: s, cents, index: i };
    }
  }
  // A badly detuned/ambiguous note needs an explicit target, not a guess.
  return best && Math.abs(best.cents) <= 150 ? best : null;
}
