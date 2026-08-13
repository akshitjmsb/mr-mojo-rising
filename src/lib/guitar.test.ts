import assert from "node:assert/strict";
import test from "node:test";
import { getSongPracticeTuning } from "./guitar";

test("uses the known recording tuning for Patience", () => {
  const tuning = getSongPracticeTuning(
    "345fde6a-1c25-4921-9db1-baf7e8d24ad2",
    "standard",
  );

  assert.equal(tuning.id, "eb-standard");
  assert.equal(tuning.offset, -1);
  assert.equal(tuning.chordShapeShift, 1);
});

test("keeps the saved fallback for songs without curated tuning data", () => {
  assert.equal(getSongPracticeTuning("another-song", "d-standard").id, "d-standard");
});
