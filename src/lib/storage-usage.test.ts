import assert from "node:assert/strict";
import test from "node:test";
import { summarizeBlobStorage } from "./storage-usage";

test("attributes every stem file to its song while preserving total usage", () => {
  const result = summarizeBlobStorage([
    { pathname: "stems/song-a/original.mp3", size: 10 },
    { pathname: "stems/song-a/preview/guitar.mp3", size: 4 },
    { pathname: "stems/song-b/vocals.mp3", size: 7 },
    { pathname: "misc/orphan.bin", size: 3 },
  ]);

  assert.equal(result.totalBytes, 24);
  assert.deepEqual(result.songBytes, { "song-a": 14, "song-b": 7 });
});
