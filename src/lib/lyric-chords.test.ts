import assert from "node:assert/strict";
import test from "node:test";
import type { Chord } from "./database.types";
import { activeLyricChord, lyricChordAnchors, lyricChordLabel } from "./lyric-chords";

const chord = (start: number, end: number, label: string, verified = true) => ({
  start_time: start, end_time: end, chord_standard: label,
  verification_state: verified ? "verified" : "withheld",
}) as Chord;

test("chord clock changes exactly at boundaries and resets after seeking", () => {
  const chords = [chord(1, 2, "C"), chord(2, 4, "G")];
  assert.equal(activeLyricChord(chords, 1.99)?.chord_standard, "C");
  assert.equal(activeLyricChord(chords, 2)?.chord_standard, "G");
  assert.equal(activeLyricChord(chords, 4), null);
  assert.equal(activeLyricChord(chords, 1)?.chord_standard, "C");
  assert.equal(activeLyricChord(chords, 0), null);
});
test("markers do not jump ahead to future words or cross long instrumental gaps", () => {
  const lines = [{time: 1, text: "one two", words: [{time: 1, text: "one"}, {time: 2, text: "two"}]}];
  const anchors = lyricChordAnchors(lines, [chord(1.9, 2.5, "G"), chord(10, 11, "C")], 0);
  assert.deepEqual([...anchors], [["0:0", ["G"]]]);
});
test("uncertain chords stay visibly estimated", () => {
  assert.equal(lyricChordLabel(chord(1, 2, "Am", false), 0), "≈Am");
});
