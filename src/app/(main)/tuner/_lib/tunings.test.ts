import assert from "node:assert/strict";
import test from "node:test";
import {
  EB_BASS_TUNING,
  TUNINGS,
  centsBetween,
  closestString,
  midiToFrequency,
  frequencyToMidi,
  detectedNote,
  tuningAtReference,
  validReferenceA,
} from "./tunings";

test("440 and 432 open-string targets derive from MIDI, without mutating defaults", () => {
  const standard = TUNINGS[0];
  const expected = [80.91, 108, 144.16, 192.43, 242.45, 323.63];
  const shifted = tuningAtReference(standard, 432);
  shifted.strings.forEach((string, i) => {
    assert.ok(Math.abs(string.frequency - expected[i]) < 0.015);
    assert.ok(Math.abs(string.frequency / standard.strings[i].frequency - 432 / 440) < 1e-12);
  });
  assert.equal(standard.strings[1].frequency, 110);
});

test("A2, A3 and A4 retain exact octave identity for each reference", () => {
  for (const reference of [415, 432, 440, 442.35, 466]) {
    for (const [midi, divisor] of [[45, 4], [57, 2], [69, 1]]) {
      const f = reference / divisor;
      assert.equal(midiToFrequency(midi, reference), f);
      assert.equal(frequencyToMidi(f, reference), midi);
      assert.equal(detectedNote(f, reference)?.name, `A${Math.floor(midi / 12) - 1}`);
      assert.equal(detectedNote(f, reference)?.cents, 0);
    }
  }
});

test("all tunings and frets use the same selected reference", () => {
  for (const reference of [415, 432, 440, 466]) for (const tuning of TUNINGS) {
    for (const string of tuningAtReference(tuning, reference).strings) {
      for (let fret = 0; fret <= 24; fret++) {
        const f = string.frequency * 2 ** (fret / 12);
        assert.equal(detectedNote(f, reference)?.midi, string.midi + fret);
      }
    }
  }
});

test("signed cents and custom bounds", () => {
  assert.ok(Math.abs(detectedNote(217.2, 432)!.cents - 9.591) < 0.01);
  assert.ok(detectedNote(215, 432)!.cents < 0);
  for (const v of [NaN, Infinity, 0, 414.99, 466.01]) assert.equal(validReferenceA(v), false);
  assert.equal(detectedNote(0, 432), null);
});

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
