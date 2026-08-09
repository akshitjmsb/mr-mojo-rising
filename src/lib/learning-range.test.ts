import assert from "node:assert/strict";
import test from "node:test";
import type { TabNote } from "./database.types";
import {
  buildLearningRangeSuggestions,
  clampLearningRange,
  passesLearningRangeAccuracyGate,
  snapLearningRange,
} from "./learning-range";

function note(id: string, start: number, duration = 0.2): TabNote {
  return {
    id,
    song_id: "song",
    start_time: start,
    duration,
    midi_pitch: 64,
    string_num: 1,
    fret: 0,
    confidence: 0.95,
  };
}

test("suggests short musical ranges inside the selected section", () => {
  const ranges = buildLearningRangeSuggestions(
    [note("1", 10), note("2", 11), note("3", 12), note("4", 15)],
    9,
    20,
    120,
  );

  assert.ok(ranges.length >= 2);
  assert.ok(ranges.every((range) => range.start >= 9 && range.end <= 20));
  assert.ok(ranges.every((range) => range.end - range.start <= 12));
  assert.ok(
    ranges.every((range) =>
      passesLearningRangeAccuracyGate(
        range,
        [note("1", 10), note("2", 11), note("3", 12), note("4", 15)],
        9,
        20,
      ),
    ),
  );
});

test("snaps start and end to padded guitar attacks", () => {
  const notes = [note("1", 10, 0.4), note("2", 12, 0.5)];
  const snapped = snapLearningRange({ start: 9.9, end: 12.7 }, notes, 8, 15);

  assert.deepEqual(snapped, { start: 9.8, end: 12.8 });
});

test("clamps ranges to the section and preserves a learnable duration", () => {
  assert.deepEqual(
    clampLearningRange({ start: 3.9, end: 4.2 }, 4, 10, "end"),
    { start: 4, end: 6 },
  );
});

test("allows a manual selection to reach the full section end", () => {
  assert.deepEqual(
    clampLearningRange({ start: 0, end: 52.9 }, 0, 52.9, "end"),
    { start: 0, end: 52.9 },
  );
});

test("accuracy gate accepts a full section and rejects empty selections", () => {
  const notes = [note("1", 5)];
  assert.equal(
    passesLearningRangeAccuracyGate({ start: 4, end: 7 }, notes, 4, 10),
    true,
  );
  assert.equal(
    passesLearningRangeAccuracyGate({ start: 4, end: 20 }, notes, 4, 20),
    true,
  );
  assert.equal(
    passesLearningRangeAccuracyGate({ start: 7, end: 9 }, notes, 4, 10),
    false,
  );
  assert.equal(
    passesLearningRangeAccuracyGate({ start: 4.4, end: 7.4 }, notes, 4, 10),
    false,
  );
});
