import unittest

import numpy as np

from chord_truth_gate import (
    AudioEvidence,
    _bass_assessment,
    assess_chroma,
    parse_chord,
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


if __name__ == "__main__":
    unittest.main()
