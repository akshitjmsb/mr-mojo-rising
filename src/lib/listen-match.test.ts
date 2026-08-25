import assert from "node:assert/strict";
import test from "node:test";
import {
  buildListenMatchPhrase,
  chordTemplate,
  evaluateRhythmTake,
  frequencyDataToChroma,
  type ChromaFrame,
} from "./listen-match";
import type { RhythmChordChange } from "./rhythm-chords";

function change(
  id: string,
  label: string,
  start: number,
  end: number,
  verified = true,
): RhythmChordChange {
  return { id, label, start, end, confidence: 0.9, verified };
}

function chordFrame(time: number, tones: number[], rms = 0.05): ChromaFrame {
  const chroma = new Array<number>(12).fill(0.005);
  for (const tone of tones) chroma[tone] = 1;
  return { time, rms, chroma };
}

test("builds a short phrase from verified chord evidence only", () => {
  const phrase = buildListenMatchPhrase(
    [
      change("guess", "Am", 0, 2, false),
      change("c", "C", 2, 5),
      change("g", "G", 5, 10),
    ],
    { start: 0, end: 12 },
  );

  assert.ok(phrase);
  assert.deepEqual(
    phrase.changes.map(({ label, start, end }) => ({ label, start, end })),
    [
      { label: "C", start: 2, end: 5 },
      { label: "G", start: 5, end: 8 },
    ],
  );
});

test("converts a displayed chord into concert pitch for lowered tuning", () => {
  const template = chordTemplate("D", -1);
  assert.ok(template);
  assert.equal(template.root, 1);
  assert.deepEqual(template.tones, [1, 5, 8]);
});

test("extracts chord pitch classes from microphone spectrum bins", () => {
  const fftSize = 8192;
  const sampleRate = 48_000;
  const spectrum = new Float32Array(fftSize / 2).fill(-100);
  for (const frequency of [261.63, 329.63, 392]) {
    spectrum[Math.round((frequency * fftSize) / sampleRate)] = -18;
  }

  const chroma = frequencyDataToChroma(spectrum, sampleRate, fftSize);
  const strongest = chroma
    .map((energy, pitchClass) => ({ energy, pitchClass }))
    .sort((left, right) => right.energy - left.energy)
    .slice(0, 3)
    .map(({ pitchClass }) => pitchClass)
    .sort((left, right) => left - right);

  assert.deepEqual(strongest, [0, 4, 7]);
});

test("passes a stable, audible take that matches every verified change", () => {
  const phrase = buildListenMatchPhrase(
    [change("c", "C", 0, 2), change("g", "G", 2, 4)],
    { start: 0, end: 4 },
  );
  assert.ok(phrase);
  const frames = Array.from({ length: 56 }, (_, index) => {
    const time = index * 0.07;
    return chordFrame(time, time < 2 ? [0, 4, 7] : [7, 11, 2]);
  });

  const result = evaluateRhythmTake(phrase, frames);

  assert.equal(result.outcome, "passed");
  assert.equal(result.targetChord, null);
});

test("withholds judgment when the microphone signal is insufficient", () => {
  const phrase = buildListenMatchPhrase(
    [change("c", "C", 0, 3)],
    { start: 0, end: 3 },
  );
  assert.ok(phrase);
  const frames = Array.from({ length: 30 }, (_, index) =>
    chordFrame(index * 0.07, [0, 4, 7], 0.001),
  );

  assert.equal(evaluateRhythmTake(phrase, frames).outcome, "withheld");
});

test("asks for a retry instead of passing a different harmony", () => {
  const phrase = buildListenMatchPhrase(
    [change("c", "C", 0, 3)],
    { start: 0, end: 3 },
  );
  assert.ok(phrase);
  const frames = Array.from({ length: 40 }, (_, index) =>
    chordFrame(index * 0.07, [2, 6, 9]),
  );

  const result = evaluateRhythmTake(phrase, frames);
  assert.equal(result.outcome, "retry");
  assert.equal(result.targetChord, "C");
});
