import assert from "node:assert/strict";
import test from "node:test";
import { yinDetect } from "./usePitchDetection";
import { TUNINGS } from "../_lib/tunings";

function sineWave(frequency: number, sampleRate = 48_000, length = 4096) {
  return Float32Array.from(
    { length },
    (_, index) =>
      Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.5,
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

test("all supported strings and detuned notes stay within 2 cents at device sample rates", () => {
  const frequencies = [
    ...new Set(
      TUNINGS.flatMap((tuning) =>
        tuning.strings.map((string) => string.frequency),
      ),
    ),
  ];
  for (const rate of [16000, 22050, 24000, 44100, 48000, 96000]) {
    for (const fundamental of frequencies) {
      for (const detune of [-40, 0, 40]) {
        const expected = fundamental * 2 ** (detune / 1200);
        const length = Math.max(
          4096,
          2 ** Math.ceil(Math.log2((rate / 29) * 4)),
        );
        const result = yinDetect(
          sineWave(expected, rate, length),
          rate,
          0.15,
          29,
          470,
        );
        assert.ok(result.frequency, `${rate} Hz: ${expected} not detected`);
        assert.ok(
          Math.abs(1200 * Math.log2(result.frequency / expected)) < 2,
          `${rate} Hz: ${expected} -> ${result.frequency}`,
        );
      }
    }
  }
});

test("a dominant second harmonic must not replace the guitar fundamental", () => {
  for (const expected of [
    73.4162, 82.4069, 110, 146.8324, 196, 246.9417, 329.6276,
  ]) {
    const samples = Float32Array.from({ length: 4096 }, (_, i) => {
      const phase = (2 * Math.PI * expected * i) / 24000;
      return (
        0.1 * Math.sin(phase) +
        0.5 * Math.sin(2 * phase) +
        0.12 * Math.sin(3 * phase)
      );
    });
    const result = yinDetect(samples, 24000, 0.15, 55, 470);
    assert.ok(result.frequency);
    assert.ok(
      Math.abs(1200 * Math.log2(result.frequency / expected)) < 2,
      `${expected} -> ${result.frequency}`,
    );
  }
});

test("quiet decaying guitar-like notes tolerate DC and modest broadband noise", () => {
  let seed = 23;
  for (const expected of [82.4069, 110, 196, 329.6276]) {
    const samples = Float32Array.from({ length: 4096 }, (_, i) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const phase = (2 * Math.PI * expected * i) / 24000;
      const noise = (seed / 2 ** 32 - 0.5) * 0.0005;
      return (
        0.02 +
        Math.exp(-i / 8000) *
          (0.004 * Math.sin(phase) + 0.002 * Math.sin(2 * phase)) +
        noise
      );
    });
    const result = yinDetect(samples, 24000, 0.15, 55, 470);
    assert.ok(result.frequency);
    assert.ok(result.clarity >= 0.85);
    assert.ok(
      Math.abs(1200 * Math.log2(result.frequency / expected)) < 3,
      `${expected} -> ${result.frequency}`,
    );
  }
});

test("rejects constant input, white noise and invalid sample rates", () => {
  let seed = 42;
  const noise = Float32Array.from({ length: 4096 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32 - 0.5;
  });
  assert.equal(yinDetect(noise, 24000, 0.15, 55, 470).frequency, null);
  assert.equal(
    yinDetect(new Float32Array(4096).fill(0.1), 24000, 0.15, 55, 470).frequency,
    null,
  );
  assert.equal(yinDetect(noise, NaN, 0.15, 55, 470).frequency, null);
  assert.equal(yinDetect(noise, 0, 0.15, 55, 470).frequency, null);
});
