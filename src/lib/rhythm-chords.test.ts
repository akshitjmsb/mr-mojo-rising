import assert from "node:assert/strict";
import test from "node:test";
import type { Chord } from "./database.types";
import { buildRhythmChordChanges } from "./rhythm-chords";

function chord(
  id: string,
  start: number,
  end: number,
  label: string,
): Chord {
  return {
    id,
    song_id: "song",
    start_time: start,
    end_time: end,
    chord_label: label,
    chord_standard: label,
    confidence: 0.9,
  };
}

test("keeps only chord changes inside the selected time range", () => {
  const result = buildRhythmChordChanges(
    [
      chord("before", 0, 4, "C"),
      chord("one", 4, 6, "G"),
      chord("two", 6, 8, "D"),
      chord("after", 8, 10, "A"),
    ],
    5,
    8,
    0,
  );

  assert.deepEqual(
    result.map(({ id, label, start, end }) => ({ id, label, start, end })),
    [
      { id: "one", label: "G", start: 5, end: 6 },
      { id: "two", label: "D", start: 6, end: 8 },
    ],
  );
});

test("merges only contiguous repeated detections and preserves unknown gaps", () => {
  const result = buildRhythmChordChanges(
    [
      chord("one", 0, 2, "C"),
      chord("repeat", 2, 4, "C"),
      chord("change", 4, 6, "G"),
    ],
    0,
    6,
    0,
  );

  assert.deepEqual(
    result.map(({ label, start, end }) => ({ label, start, end })),
    [
      { label: "C", start: 0, end: 4 },
      { label: "G", start: 4, end: 6 },
    ],
  );
});

test("withholds uncertain guesses without stretching nearby verified chords", () => {
  const uncertain = chord("guess", 2, 3, "A7");
  uncertain.confidence = 0.4;

  const result = buildRhythmChordChanges(
    [chord("one", 0, 2, "C"), uncertain, chord("two", 4, 5, "G")],
    0,
    8,
    0,
  );

  assert.deepEqual(
    result.map(({ label, start, end }) => ({ label, start, end })),
    [
      { label: "C", start: 0, end: 2 },
      { label: "G", start: 4, end: 5 },
    ],
  );
});

test("keeps the strongest withheld candidate as an honest best guess", () => {
  const guess = chord("guess", 0, 3, "D");
  guess.confidence = 0.78;
  guess.verification_state = "withheld";
  const anchor = chord("anchor", 3, 6, "G");
  anchor.verification_state = "verified";

  const result = buildRhythmChordChanges([guess, anchor], 0, 6, 0);

  assert.deepEqual(
    result.map(({ label, verified }) => ({ label, verified })),
    [
      { label: "D", verified: false },
      { label: "G", verified: true },
    ],
  );
});

test("uses the player's chord shapes and removes non-chords", () => {
  const result = buildRhythmChordChanges(
    [chord("rest", 0, 2, "N"), chord("shape", 2, 4, "D")],
    0,
    4,
    1,
  );

  assert.deepEqual(result.map(({ label }) => label), ["D#"]);
});
