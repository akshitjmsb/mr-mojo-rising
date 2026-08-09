import assert from "node:assert/strict";
import test from "node:test";
import {
  TUNINGS,
  centsToTargetFolded,
  midiToFrequency,
} from "./tunings";

test("E-flat standard contains the correct six concert pitches", () => {
  const tuning = TUNINGS.find((candidate) => candidate.id === "eb-standard");
  assert.ok(tuning);
  assert.deepEqual(
    tuning.strings.map((string) => string.midi),
    [39, 44, 49, 54, 58, 63],
  );
  assert.deepEqual(
    tuning.strings.map((string) => string.name),
    ["E♭2", "A♭2", "D♭3", "G♭3", "B♭3", "E♭4"],
  );
});

test("folded cents accepts the octave harmonic of a tuned string", () => {
  const target = midiToFrequency(39);
  assert.ok(Math.abs(centsToTargetFolded(target * 2, target)) < 0.001);
  assert.ok(centsToTargetFolded(target * 2 ** (3 / 1200), target) > 2.9);
});
