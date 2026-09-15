import assert from "node:assert/strict";
import test from "node:test";
import { summarizeBlobStorage, storageCapacity } from "./storage-usage";

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

test("deleted-song files count as occupied space, not the size of the remaining song", () => {
  const capacity = storageCapacity({ totalBytes: 240, songBytes: { live: 46, deleted: 194 } }, ["live"], 1000);
  assert.equal(capacity.average, 46);
  assert.equal(capacity.remaining, 760);
  assert.equal(capacity.estimatedSongs, 16);
});
test("empty library and quota overflow do not invent song capacity", () => {
  assert.deepEqual(storageCapacity({ totalBytes: 0, songBytes: {} }, [], 1000), { average: 0, remaining: 1000, estimatedSongs: null });
  assert.equal(storageCapacity({ totalBytes: 1100, songBytes: { a: 100 } }, ["a"], 1000).remaining, 0);
});
