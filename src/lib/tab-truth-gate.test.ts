import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTabTruthGate } from "./tab-truth-gate";

test("withholds a model transcription without independent audio evidence", () => {
  const result = evaluateTabTruthGate({
    provenance: "model-generated",
    independentSources: 1,
    audioPitchMatch: 0.98,
    audioTimingMatch: 0.97,
    humanReviewed: false,
  });

  assert.equal(result.state, "withheld");
  assert.equal(result.mayTeachAsTruth, false);
});

test("passes independent sources only when pitch and timing both clear the gate", () => {
  const result = evaluateTabTruthGate({
    provenance: "model-generated",
    independentSources: 2,
    audioPitchMatch: 0.94,
    audioTimingMatch: 0.92,
    humanReviewed: false,
  });

  assert.equal(result.state, "verified");
  assert.equal(result.mayTeachAsTruth, true);
});

test("labels a local score as a private reference instead of verified", () => {
  const result = evaluateTabTruthGate({
    provenance: "user-imported",
    independentSources: 1,
    audioPitchMatch: null,
    audioTimingMatch: null,
    humanReviewed: false,
  });

  assert.equal(result.state, "private-reference");
  assert.equal(result.mayTeachAsTruth, false);
});
