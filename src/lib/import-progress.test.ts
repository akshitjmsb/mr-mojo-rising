import assert from "node:assert/strict";
import test from "node:test";
import { importProgressIndex, isLessonReady } from "./import-progress";

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
    2,
  );
  assert.equal(
    importProgressIndex({ status: "processing", processing_stage: "refine" }),
    3,
  );
  assert.equal(
    importProgressIndex({ status: "processing", processing_stage: "analyze" }),
    4,
  );
  assert.equal(
    importProgressIndex({
      status: "processing",
      processing_stage: "quality_gate",
    }),
    4,
  );
  assert.equal(
    importProgressIndex({ status: "ready", processing_stage: "complete" }),
    5,
  );
});

test("does not treat a playable preview as a completed lesson", () => {
  assert.equal(
    importProgressIndex({
      status: "processing",
      processing_stage: "refine",
      preview_ready: 1,
    }),
    3,
  );
});

test("opens Learn only when both durable completion signals agree", () => {
  assert.equal(
    isLessonReady({
      status: "processing",
      processing_stage: "refine",
      preview_ready: 1,
    }),
    false,
  );
  assert.equal(
    isLessonReady({ status: "ready", processing_stage: "analyze" }),
    false,
  );
  assert.equal(
    isLessonReady({ status: "processing", processing_stage: "complete" }),
    false,
  );
  assert.equal(
    isLessonReady({ status: "ready", processing_stage: "complete" }),
    true,
  );
});
