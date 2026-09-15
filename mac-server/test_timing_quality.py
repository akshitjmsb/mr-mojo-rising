import unittest
from timing_quality import timing_agreement

def word(line, start, score=1):
    return {"line":line,"word_index":0,"start":start,"score":score}

class TimingAgreementTests(unittest.TestCase):
    def test_repeated_lines_are_separate_occurrences(self):
        self.assertFalse(timing_agreement([word(0,2),word(1,2)],[word(0,2),word(1,8)])["passed"])

    def test_full_coverage_does_not_excuse_drift(self):
        self.assertFalse(timing_agreement([word(0,47)],[word(0,30)])["passed"])

    def test_low_score_or_missing_anchor_fails(self):
        self.assertFalse(timing_agreement([word(0,2)],[word(0,2,.1)])["passed"])
        self.assertFalse(timing_agreement([word(0,2)],[])["passed"])

    def test_matching_audio_anchors_pass_agreement_only(self):
        result=timing_agreement([word(0,2.1),word(1,8.2)],[word(0,2),word(1,8)])
        self.assertTrue(result["passed"])
        self.assertIn("not_ground_truth",result["kind"])

    def test_missing_candidate_and_invalid_order_fail(self):
        self.assertFalse(timing_agreement([],[word(0,2)])["passed"])
        self.assertFalse(timing_agreement([word(0,8),word(1,2)],[word(0,8),word(1,2)])["passed"])

if __name__ == "__main__":
    unittest.main()
