import assert from "node:assert/strict";
import test from "node:test";
import type { TabNote } from "./database.types";
import { extractLeadNotes } from "./lead-notes";

function note(
  id: string,
  start: number,
  pitch: number,
  confidence = 0.9,
): TabNote {
  return {
    id,
    song_id: "song",
    start_time: start,
    duration: 0.2,
    midi_pitch: pitch,
    string_num: 1,
    fret: 0,
    confidence,
  };
}

test("keeps one melodic note from a simultaneous rhythm stack", () => {
  const result = extractLeadNotes([
    note("low", 1, 52),
    note("middle", 1.02, 59),
    note("melody", 1.01, 67),
  ]);

  assert.deepEqual(result.map((item) => item.id), ["melody"]);
});

test("preserves separately played notes in a lead run", () => {
  const result = extractLeadNotes([
    note("one", 1, 64),
    note("two", 1.12, 66),
    note("three", 1.24, 67),
  ]);

  assert.deepEqual(result.map((item) => item.id), ["one", "two", "three"]);
});

test("prefers confident continuity over a distant bleed note", () => {
  const result = extractLeadNotes([
    note("start", 1, 69),
    note("continuation", 1.2, 71, 0.95),
    note("bleed", 1.21, 88, 0.55),
  ]);

  assert.deepEqual(result.map((item) => item.id), ["start", "continuation"]);
});
