import tempfile
import unittest
from pathlib import Path
import numpy as np
import soundfile as sf
from vocal_quality import publish_clean_vocal


class VocalQualityTests(unittest.TestCase):
    def test_quiet_sections_do_not_get_instruments_added(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            clean = np.full((4000, 2), 0.1, dtype=np.float32)
            clean[1000:3000] = 0
            sf.write(root / "clean.wav", clean, 1000, subtype="FLOAT")
            sf.write(root / "broad.wav", np.full_like(clean, 0.3), 1000)
            publish_clean_vocal(root / "clean.wav", root / "broad.wav", root / "out.wav")
            actual, _ = sf.read(root / "out.wav")
            self.assertEqual(float(np.max(np.abs(actual[1000:3000]))), 0)
            self.assertEqual((root / "clean.wav").read_bytes(), (root / "out.wav").read_bytes())

    def test_truncated_candidate_does_not_replace_existing_audio(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sf.write(root / "clean.wav", np.ones(1000) * 0.1, 1000)
            sf.write(root / "broad.wav", np.ones(2000) * 0.1, 1000)
            with self.assertRaises(ValueError):
                publish_clean_vocal(root / "clean.wav", root / "broad.wav", root / "out.wav")
            self.assertFalse((root / "out.wav").exists())
