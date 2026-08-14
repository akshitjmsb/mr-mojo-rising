import assert from "node:assert/strict";
import test from "node:test";
import { importProgressIndex } from "./import-progress";

test("maps durable worker stages to learner-facing progress", () => {
  assert.equal(importProgressIndex({ status: "queued" }), 0);
  assert.equal(
    importProgressIndex({ status: "processing", processing_stage: "download" }),
    1,
  );
  assert.equal(
    importProgressIndex({ status: "processing", processing_stage: "separate" }),
    2,
  );
  assert.equal(
    importProgressIndex({
      status: "processing",
      processing_stage: "preview_upload",
    }),
    3,
  );
  assert.equal(importProgressIndex({ status: "ready" }), 4);
});

test("treats a playable preview and later enrichment as ready", () => {
  assert.equal(
    importProgressIndex({ status: "processing", preview_ready: 1 }),
    4,
  );
  assert.equal(
    importProgressIndex({ status: "processing", processing_stage: "refine" }),
    4,
  );
});
