import assert from "node:assert/strict";
import test from "node:test";
import { PitchTracker } from "./pitch-tracker";

test("requires consecutive stable frames and immediately removes green on silence", () => {
  const tracker = new PitchTracker();
  for (let i = 0; i < 3; i++)
    assert.equal(tracker.update(110, i * 40).stable, false);
  assert.equal(tracker.update(110, 120).stable, true);
  assert.deepEqual(tracker.update(null, 160), {
    frequency: 110,
    stable: false,
  });
  assert.equal(tracker.update(110, 200).stable, false);
  assert.deepEqual(tracker.update(null, 500), {
    frequency: null,
    stable: false,
  });
});

test("changing strings, interruptions, and invalid signals cannot inherit a stable reading", () => {
  const tracker = new PitchTracker();
  for (let i = 0; i < 5; i++) tracker.update(110, i * 40);
  assert.equal(tracker.update(220, 200).stable, false);
  tracker.reset();
  assert.equal(tracker.update(220, 500).stable, false);
  assert.equal(tracker.update(NaN, 540).stable, false);
  assert.equal(tracker.update(0, 580).stable, false);
  assert.equal(tracker.update(220, 1000).stable, false);
});

test("moving pitch cannot look stable through a median filter", () => {
  const tracker = new PitchTracker();
  for (let i = 0; i < 12; i++)
    assert.equal(
      tracker.update(110 * 2 ** ((i * 8) / 1200), i * 40).stable,
      false,
    );
});
