import type { Chord } from "./database.types";
import type { LrcLine } from "./lrc-parser";
import { transposeChord } from "./guitar";

export function activeLyricChord(chords: Chord[], time: number): Chord | null {
  if (!Number.isFinite(time)) return null;
  return chords.filter(chord => chord.start_time <= time && time < chord.end_time)
    .sort((a, b) => b.start_time - a.start_time)[0] ?? null;
}

export function lyricChordLabel(chord: Chord, shift: number): string {
  return `${chord.verification_state === "verified" ? "" : "≈"}${transposeChord(chord.chord_standard, shift)}`;
}

/** Word markers are reading aids; the live chord follows its own timestamp. */
export function lyricChordAnchors(lines: LrcLine[], chords: Chord[], shift: number): Map<string, string[]> {
  const words = lines.flatMap((line, lineIndex) => (line.words ?? []).map((word, wordIndex) => ({
    key: `${lineIndex}:${wordIndex}`, time: word.time,
  }))).sort((a, b) => a.time - b.time);
  const anchors = new Map<string, string[]>();
  for (const chord of [...chords].sort((a, b) => a.start_time - b.start_time)) {
    // Anchor to the word underway, not a future word up to 1.5 seconds away.
    let index = -1;
    for (let i = 0; i < words.length && words[i].time <= chord.start_time; i++) index = i;
    if (index < 0 || chord.start_time - words[index].time > 2) continue;
    const key = words[index].key;
    const label = lyricChordLabel(chord, shift);
    const labels = anchors.get(key) ?? [];
    if (labels[labels.length - 1] !== label) anchors.set(key, [...labels, label]);
  }
  return anchors;
}
