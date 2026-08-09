import assert from "node:assert/strict";
import test from "node:test";
import type { TabNote } from "./database.types";
import {
  buildRhythmAttacks,
  buildRhythmStrokeGrid,
} from "./rhythm-attacks";

function note(id: string, start: number): TabNote {
  return {
    id,
    song_id: "song",
    start_time: start,
    duration: 0.2,
    midi_pitch: 60,
    string_num: 1,
    fret: 0,
    confidence: 0.9,
  };
}

test("groups the notes of one strum into a single guitar attack", () => {
  const attacks = buildRhythmAttacks(
    [note("1", 10), note("2", 10.03), note("3", 10.07), note("4", 10.5)],
    10,
    11,
  );
  assert.equal(attacks.length, 2);
  assert.equal(attacks[0].noteCount, 3);
  assert.equal(attacks[1].noteCount, 1);
  assert.ok(attacks[0].strength > attacks[1].strength);
});

test("ignores attacks outside the active listening range", () => {
  const attacks = buildRhythmAttacks(
    [note("before", 9.9), note("inside", 10.2), note("after", 11)],
    10,
    11,
  );
  assert.deepEqual(attacks.map((attack) => attack.time), [10.2]);
});

test("maps real attacks to alternating down and up eighth-note motions", () => {
  const attacks = buildRhythmAttacks(
    [note("beat", 10), note("and", 10.25), note("two", 10.5)],
    10,
    14,
  );
  const strokes = buildRhythmStrokeGrid(attacks, 10, 14, 120);
  assert.equal(strokes.length, 16);
  assert.deepEqual(
    strokes.slice(0, 4).map(({ direction, sounded }) => ({
      direction,
      sounded,
    })),
    [
      { direction: "down", sounded: true },
      { direction: "up", sounded: true },
      { direction: "down", sounded: true },
      { direction: "up", sounded: false },
    ],
  );
});
