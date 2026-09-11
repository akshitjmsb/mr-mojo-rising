import assert from "node:assert/strict";
import test from "node:test";
import {
  EB_BASS_TUNING,
  TUNINGS,
  centsBetween,
  closestString,
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

test("a pinned target never treats another octave as in tune", () => {
  const target = midiToFrequency(39);
  assert.equal(centsBetween(target * 2, target), 1200);
  assert.equal(centsBetween(target * 4, target), 2400);
  assert.ok(centsBetween(target * 2 ** (3 / 1200), target) > 2.9);
});

test("E-flat bass tuning contains the correct four concert pitches", () => {
  assert.deepEqual(
    EB_BASS_TUNING.strings.map((string) => string.midi),
    [27, 32, 37, 42],
  );
});

test("automatic matching preserves low and high E string identity", () => {
  const standard = TUNINGS.find((candidate) => candidate.id === "standard");
  assert.ok(standard);

  assert.equal(closestString(midiToFrequency(40), standard)?.index, 0);
  assert.equal(closestString(midiToFrequency(64), standard)?.index, 5);
  assert.equal(closestString(midiToFrequency(40) * 2, standard), null);
});

test("every string in every tuning keeps its identity without octave folding", () => {
  for (const tuning of TUNINGS) {
    tuning.strings.forEach((string, index) => {
      for (const detune of [-30, 0, 30]) {
        const match = closestString(
          string.frequency * 2 ** (detune / 1200),
          tuning,
        );
        assert.equal(match?.index, index, `${tuning.id} ${string.name}`);
        assert.ok(Math.abs(match!.cents - detune) < 0.0001);
      }
    });
  }
});
