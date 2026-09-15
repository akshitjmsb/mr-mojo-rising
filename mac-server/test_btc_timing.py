import unittest
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
from btc.features import audio_file_to_features


class FrameTimingTests(unittest.TestCase):
    def test_chunk_origins_and_partial_tail_follow_samples(self):
        sr, hop = 22050, 2048
        config = SimpleNamespace(mp3={"song_hz": sr, "inst_len": 10},
                                 feature={"n_bins": 2, "bins_per_octave": 12, "hop_length": hop},
                                 model={"timestep": 108})
        def fake_cqt(y, **kwargs):
            return np.ones((2, 1 + len(y) // hop))
        with patch("btc.features.librosa.load", return_value=(np.zeros(int(25.315 * sr)), sr)), \
             patch("btc.features.librosa.cqt", side_effect=fake_cqt):
            features, times, duration = audio_file_to_features("unused", config)
        self.assertEqual(features.shape[1], len(times))
        self.assertAlmostEqual(times[107], 107 * hop / sr)
        self.assertEqual(times[108], 10)
        self.assertEqual(times[216], 20)
        self.assertAlmostEqual(times[-1], 20 + (len(times)-217) * hop / sr)
        self.assertTrue(np.all(np.diff(times) > 0))
        self.assertLessEqual(times[-1], duration)


if __name__ == "__main__":
    unittest.main()
