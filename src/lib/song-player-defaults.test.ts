import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SONG_LAYER,
  fullSongRange,
  skipWithinRange,
} from "./song-player-defaults";

test("opens a song on the complete vocal track", () => {
  assert.equal(DEFAULT_SONG_LAYER, "vocals");
  assert.deepEqual(
    fullSongRange([
      { start_time: 24, end_time: 51 },
      { start_time: 0, end_time: 24 },
      { start_time: 51, end_time: 197 },
    ]),
    { start: 0, end: 197 },
  );
});

test("back and forward controls stay inside the selected song range", () => {
  const range = { start: 20, end: 60 };
  assert.equal(skipWithinRange(24, -10, range), 20);
  assert.equal(skipWithinRange(55, 10, range), 60);
  assert.equal(skipWithinRange(35, 10, range), 45);
});
