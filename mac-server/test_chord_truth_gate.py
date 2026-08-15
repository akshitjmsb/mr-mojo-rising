import unittest

import numpy as np

from chord_truth_gate import (
    AudioEvidence,
    _bass_assessment,
    assess_chroma,
    merge_core_candidates,
    parse_chord,
    snap_boundaries_to_attacks,
    verify_candidates_with_evidence,
)


def chroma_for(*pitch_classes: int) -> np.ndarray:
    chroma = np.zeros(12, dtype=np.float64)
    for pitch_class in pitch_classes:
        chroma[pitch_class] = 1.0
    return chroma


class ChordTruthGateTests(unittest.TestCase):
    def test_accepts_a_clear_independently_supported_major_chord(self):
        chroma = chroma_for(0, 4, 7)
        result = assess_chroma("C", chroma, [chroma, chroma, chroma])

        self.assertTrue(result["passed"])
        self.assertEqual(result["reason"], "verified")
        self.assertGreaterEqual(result["acoustic_score"], 0.62)

    def test_withholds_when_the_third_is_missing_and_quality_is_ambiguous(self):
        chroma = chroma_for(0, 7)
        result = assess_chroma("C", chroma, [chroma, chroma])

        self.assertFalse(result["passed"])
        self.assertNotEqual(result["reason"], "verified")

    def test_withholds_unsupported_labels_instead_of_guessing(self):
        self.assertIsNone(parse_chord("Cadd9/G"))

    def test_bass_can_veto_a_guitar_candidate(self):
        chord = parse_chord("C")
        self.assertIsNotNone(chord)
        bass_chroma = np.zeros((12, 4), dtype=np.float64)
        bass_chroma[6, :] = 1.0  # F# contradicts C major.
        bass = AudioEvidence(
            chroma=bass_chroma,
            rms=np.ones(4, dtype=np.float64),
            frames_per_second=1.0,
            energy_floor=0.01,
        )

        passed, support, reason = _bass_assessment(chord, bass, 0, 4)

        self.assertFalse(passed)
        self.assertEqual(support, 0.0)
        self.assertEqual(reason, "bass_contradicts_chord")

    def test_merges_unproven_extensions_into_one_core_interval(self):
        merged = merge_core_candidates(
            [
                {
                    "start": 0.0,
                    "end": 1.0,
                    "label": "C",
                    "standard": "C",
                    "confidence": 0.9,
                },
                {
                    "start": 1.05,
                    "end": 2.0,
                    "label": "C:7",
                    "standard": "C7",
                    "confidence": 0.7,
                },
            ]
        )

        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["standard"], "C")
        self.assertEqual(merged[0]["end"], 2.0)
        self.assertGreater(merged[0]["confidence"], 0.79)

    def test_snaps_a_continuous_change_to_the_nearest_guitar_attack(self):
        snapped = snap_boundaries_to_attacks(
            [
                {"start": 0.0, "end": 2.0, "standard": "C"},
                {"start": 2.0, "end": 4.0, "standard": "G"},
            ],
            np.array([1.91]),
        )

        self.assertEqual(snapped[0]["end"], 1.91)
        self.assertEqual(snapped[1]["start"], 1.91)

    def test_repeated_anchors_rescue_an_ambiguous_occurrence(self):
        chroma = np.zeros((12, 50), dtype=np.float64)
        chroma[[0, 4, 7], 0:10] = 1.0
        chroma[[7, 11, 2], 10:20] = 1.0
        chroma[[0, 1, 4, 7], 20:30] = 1.0
        chroma[[7, 11, 2], 30:40] = 1.0
        chroma[[0, 4, 7], 40:50] = 1.0
        guitar = AudioEvidence(
            chroma=chroma,
            rms=np.ones(50, dtype=np.float64),
            frames_per_second=10.0,
            energy_floor=0.01,
            onset_times=np.array([1.0, 2.0, 3.0, 4.0]),
        )
        labels = ["C", "G", "C", "G", "C"]
        candidates = [
            {
                "start": float(index),
                "end": float(index + 1),
                "label": label,
                "standard": label,
                "confidence": 0.9,
            }
            for index, label in enumerate(labels)
        ]

        results = verify_candidates_with_evidence(candidates, guitar)

        self.assertEqual(results[2]["verification"]["state"], "verified")
        self.assertEqual(
            results[2]["verification"]["reason"],
            "verified_repetition",
        )


if __name__ == "__main__":
    unittest.main()
