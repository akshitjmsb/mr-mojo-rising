import tempfile
import unittest
from pathlib import Path
import numpy as np
import soundfile as sf
from accompaniment_mix import render_accompaniment


class MixTests(unittest.TestCase):
    def test_different_sample_rates_keep_same_duration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sf.write(root / "v.wav", np.ones(44100)*0.1, 44100)
            sf.write(root / "g.wav", np.ones(48000)*0.1, 48000)
            render_accompaniment(root / "v.wav", root / "g.wav", root / "mix.wav")
            self.assertEqual(sf.info(root / "mix.wav").frames, 44100)

    def test_both_sources_preserved_and_no_source_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            t = np.arange(8000) / 8000
            for name, frequency in [("v", 200), ("g", 500)]:
                sf.write(root / f"{name}.wav", np.sin(t * 2*np.pi*frequency)*0.2, 8000, subtype="FLOAT")
            before = (root / "v.wav").read_bytes()
            render_accompaniment(root / "v.wav", root / "g.wav", root / "mix.wav")
            mixed, rate = sf.read(root / "mix.wav")
            spectrum = np.abs(np.fft.rfft(mixed))
            self.assertGreater(spectrum[200], 100)
            self.assertGreater(spectrum[500], 100)
            self.assertEqual(len(mixed), 8000)
            self.assertEqual(rate, 8000)
            self.assertLessEqual(abs(mixed).max(), 0.951)
            self.assertEqual(before, (root / "v.wav").read_bytes())

    def test_silent_guitar_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sf.write(root / "v.wav", np.ones(8000)*0.1, 8000)
            sf.write(root / "g.wav", np.zeros(8000), 8000)
            with self.assertRaises(ValueError):
                render_accompaniment(root / "v.wav", root / "g.wav", root / "mix.wav")
