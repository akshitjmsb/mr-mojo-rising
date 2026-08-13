export type TabSignalProvenance =
  | "model-generated"
  | "user-imported"
  | "curated";

export type TabSignalEvidence = {
  provenance: TabSignalProvenance;
  independentSources: number;
  audioPitchMatch: number | null;
  audioTimingMatch: number | null;
  humanReviewed: boolean;
};

export type TabTruthGateResult = {
  state: "verified" | "private-reference" | "withheld";
  mayTeachAsTruth: boolean;
  reason: string;
};

const MINIMUM_AUDIO_MATCH = 0.9;

/**
 * A model confidence value is deliberately not evidence here. Generated fret
 * positions are teachable only after independent agreement and an audio match,
 * or after a human review. A private import can be displayed with provenance,
 * but Mojo does not label it verified.
 */
export function evaluateTabTruthGate(
  evidence: TabSignalEvidence,
): TabTruthGateResult {
  if (evidence.provenance === "user-imported") {
    return {
      state: "private-reference",
      mayTeachAsTruth: false,
      reason: "Private score displayed with its source intact.",
    };
  }

  if (evidence.humanReviewed) {
    return {
      state: "verified",
      mayTeachAsTruth: true,
      reason: "Human-reviewed transcription.",
    };
  }

  if (
    evidence.independentSources >= 2 &&
    evidence.audioPitchMatch !== null &&
    evidence.audioPitchMatch >= MINIMUM_AUDIO_MATCH &&
    evidence.audioTimingMatch !== null &&
    evidence.audioTimingMatch >= MINIMUM_AUDIO_MATCH
  ) {
    return {
      state: "verified",
      mayTeachAsTruth: true,
      reason: "Independent agreement confirmed against the audio.",
    };
  }

  return {
    state: "withheld",
    mayTeachAsTruth: false,
    reason: "The detected notes do not have enough independent audio evidence.",
  };
}

export const GENERATED_TAB_GATE = evaluateTabTruthGate({
  provenance: "model-generated",
  independentSources: 1,
  audioPitchMatch: null,
  audioTimingMatch: null,
  humanReviewed: false,
});
