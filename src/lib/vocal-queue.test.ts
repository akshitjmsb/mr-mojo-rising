import assert from "node:assert/strict";
import test from "node:test";
import { vocalOrder } from "./vocal-queue";

test("sequential playback includes every song once in library order", () => {
  assert.deepEqual(vocalOrder(["a", "b", "a", "c"], false), ["a", "b", "c"]);
});

test("shuffle visits every song and avoids an immediate repeat across cycles", () => {
  const order = vocalOrder(["a", "b", "c"], true, "b", () => 0);
  assert.deepEqual([...order].sort(), ["a", "b", "c"]);
  assert.notEqual(order[0], "b");
  assert.deepEqual(vocalOrder(["a"], true, "a"), ["a"]);
  assert.deepEqual(vocalOrder([], true), []);
});
