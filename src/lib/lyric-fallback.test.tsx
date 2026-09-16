import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import SyncedLyrics from "../app/song/[id]/_components/SyncedLyrics";
import type { Chord, Lyrics } from "./database.types";
import { cleanLyricText } from "./lyric-text";

const chords = [{ start_time: 1, end_time: 4, chord_standard: "D", verification_state: "withheld" }] as Chord[];
function render(lyrics: Lyrics | null, time = 2, notes = chords, range = { start: 0, end: 10 }) {
  return renderToStaticMarkup(<SyncedLyrics compact lyrics={lyrics} chords={notes} chordShapeShift={0} currentTime={time} range={range} onSeek={() => {}} />);
}
test("credits are removed without deleting sung lines or repeats", () => {
  assert.equal(cleanLyricText("作词 : Someone\nComposer: Someone\nMusic is my life\nMusic is my life"), "Music is my life\nMusic is my life");
});
test("plain lyrics do not hide the independent chord clock", () => {
  const output = render({ plain_text: "作曲 : Someone\nA sung line", synced_lrc: null, source: "local_alignment_withheld" } as Lyrics);
  assert.match(output, /data-current-chord="D"/);
  assert.match(output, /Lyrics not synced/);
  assert.doesNotMatch(output, /Someone/);
  assert.match(output, /A sung line/);
});
test("missing lyrics, empty sections, and missing chords degrade independently", () => {
  assert.match(render(null), /data-current-chord="D"/);
  assert.match(render(null), /Lyrics unavailable/);
  assert.match(render({ synced_lrc: "[00:20.00]Later words", source: "catalog" } as Lyrics), /data-current-chord="D"/);
  assert.match(render(null, 2, []), /Chords unavailable/);
});
test("seeking changes chord without needing any lyric timestamps", () => {
  assert.match(render(null, 0), /data-current-chord=""/);
  assert.match(render(null, 2), /data-current-chord="D"/);
  assert.match(render(null, 4), /data-current-chord=""/);
  assert.match(render(null, 2), /data-current-chord="D"/);
});
