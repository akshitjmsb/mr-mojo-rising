import assert from "node:assert/strict";
import test from "node:test";
import { chordMidiNotes, getChordShape } from "./chord-shapes";

test("provides the six open chord shapes used in the Patience lesson", () => {
  for (const chord of ["C", "G", "A7", "D", "A", "Am7"]) {
    const shape = getChordShape(chord);
    assert.ok(shape, `${chord} should have a diagram`);
    assert.equal(shape.frets.length, 6);
    assert.equal(shape.fingers.length, 6);
  }
});

test("marks open, muted, and fretted strings for a C shape", () => {
  assert.deepEqual(getChordShape("C")?.frets, [null, 3, 2, 0, 1, 0]);
  assert.equal(getChordShape("F#"), null);
});

test("voices chord references using the physical E-flat tuning positions", () => {
  const shape = getChordShape("C");
  assert.ok(shape);
  assert.deepEqual(chordMidiNotes(shape, -1), [47, 51, 54, 59, 63]);
});
