import assert from "node:assert/strict";
import test from "node:test";
import { yinDetect } from "./usePitchDetection";

function sineWave(frequency: number, sampleRate = 48_000, length = 4096) {
  return Float32Array.from(
    { length },
    (_, index) => Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.5,
  );
}

test("detects supported guitar and bass fundamentals within two cents", () => {
  for (const expected of [38.8909, 82.4069, 329.6276]) {
    const result = yinDetect(sineWave(expected), 48_000, 0.15, 30, 700);
    assert.ok(result.frequency);
    const cents = 1200 * Math.log2(result.frequency / expected);
    assert.ok(
      Math.abs(cents) < 2,
      `${expected} Hz: expected <2 cents, received ${cents}`,
    );
    assert.ok(result.clarity > 0.9);
  }
});

test("rejects silence instead of inventing a pitch", () => {
  const result = yinDetect(new Float32Array(4096), 48_000, 0.15, 60, 700);
  assert.equal(result.frequency, null);
});
