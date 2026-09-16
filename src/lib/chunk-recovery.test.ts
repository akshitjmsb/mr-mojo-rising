import assert from "node:assert/strict";
import test from "node:test";
import { claimChunkReload, isChunkLoadError } from "./chunk-recovery";
test("recognizes stale webpack and Safari module errors, not unrelated errors", () => {
  for (const message of ["Loading chunk 512 failed.", "Loading CSS chunk 5 failed", "Importing a module script failed.", "Failed to fetch dynamically imported module"])
    assert.equal(isChunkLoadError({ message }), true);
  assert.equal(isChunkLoadError({ message: "Song not found" }), false);
});
test("reload guard survives mounts and prevents cross-route reload loops", () => {
  let value: string | null = null;
  const storage = { getItem: () => value, setItem: (_: string, next: string) => { value = next; } };
  assert.equal(claimChunkReload(storage, 1000), true);
  assert.equal(claimChunkReload(storage, 1001), false);
  assert.equal(claimChunkReload(storage, 300999), false);
  assert.equal(claimChunkReload(storage, 301001), true);
});
test("blocked storage never causes automatic reload", () => {
  assert.equal(claimChunkReload({ getItem: () => { throw Error("blocked"); }, setItem() {} }), false);
});
