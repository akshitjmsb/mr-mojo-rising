import assert from "node:assert/strict";
import test from "node:test";
import { cleanDeletedSong, songBlobPrefix } from "./blob-cleanup-core";
const id = "119d33b1-9e5d-44bd-b93a-f37c9ccebe63";
const prefix = songBlobPrefix(id);
const blob = { pathname: prefix + "vocals.mp3", url: "https://example.test/vocals.mp3" };
test("only deletes exact files after complete paginated inventory", async () => {
  const removed: string[] = [];
  const count = await cleanDeletedSong(id, {
    songExists: async () => false,
    list: async (_, cursor) => cursor ? { blobs: [], hasMore: false } : { blobs: [blob], hasMore: true, cursor: "next" },
    remove: async urls => { removed.push(...urls); },
  });
  assert.equal(count, 1);
  assert.deepEqual(removed, [blob.url]);
});
test("existing/restored songs and out-of-scope files are protected", async () => {
  let calls = 0;
  let deletes = 0;
  const io = { songExists: async () => ++calls === 2, list: async () => ({ blobs: [blob], hasMore: false }), remove: async () => { deletes++; } };
  await assert.rejects(cleanDeletedSong(id, io), /restored/);
  await assert.rejects(cleanDeletedSong(id, { ...io, songExists: async () => true }), /still exists/);
  await assert.rejects(cleanDeletedSong(id, { ...io, songExists: async () => false, list: async () => ({ blobs: [{ ...blob, pathname: "stems/other/file" }], hasMore: false }) }), /outside/);
  assert.equal(deletes, 0);
  assert.throws(() => songBlobPrefix("../"), /Invalid/);
});
test("listing and deletion failures propagate so durable jobs can retry", async () => {
  const io = { songExists: async () => false, list: async () => ({ blobs: [blob], hasMore: false }), remove: async () => { throw new Error("network"); } };
  await assert.rejects(cleanDeletedSong(id, io), /network/);
  await assert.rejects(cleanDeletedSong(id, { ...io, list: async () => ({ blobs: [blob], hasMore: true }) }), /Incomplete/);
  assert.equal(await cleanDeletedSong(id, { ...io, list: async () => ({ blobs: [], hasMore: false }) }), 0);
});
