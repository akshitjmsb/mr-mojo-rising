import assert from "node:assert/strict";
import test from "node:test";
import { getChordShape } from "./chord-shapes";

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
