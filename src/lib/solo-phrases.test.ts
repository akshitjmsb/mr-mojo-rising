import assert from "node:assert/strict";
import test from "node:test";
import type { TabNote } from "./database.types";
import { buildMusicalPhrases } from "./solo-phrases";

function note(id: string, start: number, duration = 0.2): TabNote {
  return {
    id,
    song_id: "song",
    start_time: start,
    duration,
    midi_pitch: 64,
    string_num: 1,
    fret: 0,
    confidence: 0.9,
  };
}

test("splits phrases at musical pauses", () => {
  const phrases = buildMusicalPhrases(
    [note("1", 10), note("2", 11), note("3", 12), note("4", 13.1)],
    9,
    15,
    { pauseThreshold: 0.5 },
  );

  assert.equal(phrases.length, 2);
  assert.ok(phrases[0].end < 13.1);
  assert.ok(phrases[1].start < 13.1);
});

test("uses the best available gap before a phrase grows too long", () => {
  const phrases = buildMusicalPhrases(
    [
      note("1", 0),
      note("2", 1),
      note("3", 2.4),
      note("4", 3),
      note("5", 4),
      note("6", 5.6),
      note("7", 6.1),
    ],
    0,
    8,
    { maximumDuration: 5.5, pauseThreshold: 2 },
  );

  assert.ok(phrases.length >= 2);
  assert.ok(phrases[0].end <= 4.5);
});

test("ignores notes outside the requested section", () => {
  const phrases = buildMusicalPhrases(
    [note("before", 1), note("inside", 5), note("after", 12)],
    4,
    10,
  );

  assert.deepEqual(phrases, [{ start: 4.78, end: 5.5 }]);
});
