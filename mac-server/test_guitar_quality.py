import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

from guitar_quality import (
    build_guitar_focus_mix,
    build_non_vocal_bed,
    combine_guitar_candidates,
)


class GuitarQualityTests(unittest.TestCase):
    def test_direct_model_fills_phrase_missing_from_primary(self):
        sample_rate = 1000
        seconds = 4
        time = np.arange(sample_rate * seconds) / sample_rate
        coverage = (0.2 * np.sin(2 * np.pi * 120 * time)).astype(np.float32)
        primary = coverage.copy()
        primary[sample_rate : sample_rate * 3] = 0

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            primary_path = root / "primary.wav"
            coverage_path = root / "coverage.wav"
            output_path = root / "combined.wav"
            sf.write(primary_path, primary, sample_rate)
            sf.write(coverage_path, coverage, sample_rate)

            report = combine_guitar_candidates(
                primary_path,
                coverage_path,
                output_path,
            )
            combined, _ = sf.read(output_path, dtype="float32")

            restored_rms = float(
                np.sqrt(np.mean(combined[sample_rate : sample_rate * 3] ** 2))
            )
            self.assertGreaterEqual(report["fallback_windows"], 2)
            self.assertGreater(restored_rms, 0.08)

    def test_focus_mix_keeps_guitar_forward_with_quiet_original_bed(self):
        sample_rate = 1000
        time = np.arange(sample_rate * 4) / sample_rate
        guitar = (0.2 * np.sin(2 * np.pi * 120 * time)).astype(np.float32)
        accompaniment = (0.1 * np.sin(2 * np.pi * 40 * time)).astype(np.float32)
        original = guitar + accompaniment

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            original_path = root / "original.wav"
            guitar_path = root / "guitar.wav"
            output_path = root / "focus.wav"
            sf.write(original_path, original, sample_rate)
            sf.write(guitar_path, guitar, sample_rate)

            report = build_guitar_focus_mix(
                original_path,
                guitar_path,
                output_path,
                background_gain=0.24,
            )
            focus, _ = sf.read(output_path, dtype="float32")

            self.assertTrue(report["passed"])
            self.assertGreater(report["foreground_energy_ratio"], 0.85)
            self.assertGreater(float(np.sqrt(np.mean(focus**2))), 0.1)

    def test_non_vocal_bed_removes_primary_vocal_signal(self):
        sample_rate = 4000
        time = np.arange(sample_rate * 2) / sample_rate
        guitar = (0.18 * np.sin(2 * np.pi * 180 * time)).astype(np.float32)
        vocals = (0.12 * np.sin(2 * np.pi * 440 * time)).astype(np.float32)
        original = guitar + vocals

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            original_path = root / "original.wav"
            vocals_path = root / "vocals.wav"
            bed_path = root / "non-vocal-bed.wav"
            sf.write(original_path, original, sample_rate)
            sf.write(vocals_path, vocals, sample_rate)

            report = build_non_vocal_bed(
                original_path,
                vocals_path,
                bed_path,
            )
            bed, _ = sf.read(bed_path, dtype="float32")

            self.assertTrue(np.allclose(bed, guitar, atol=2e-4))
            self.assertEqual(len(bed), len(original))
            self.assertGreater(report["removed_vocal_rms_ratio"], 0.5)

    def test_non_vocal_bed_rejects_incomplete_vocal_coverage(self):
        sample_rate = 1000
        original = np.zeros(sample_rate * 2, dtype=np.float32)
        short_vocals = np.zeros(sample_rate, dtype=np.float32)

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            original_path = root / "original.wav"
            vocals_path = root / "vocals.wav"
            bed_path = root / "non-vocal-bed.wav"
            sf.write(original_path, original, sample_rate)
            sf.write(vocals_path, short_vocals, sample_rate)

            with self.assertRaisesRegex(ValueError, "cover the full song"):
                build_non_vocal_bed(original_path, vocals_path, bed_path)

    def test_focus_mix_rejects_invalid_background_gain(self):
        with self.assertRaises(ValueError):
            build_guitar_focus_mix(
                Path("original.wav"),
                Path("guitar.wav"),
                Path("focus.wav"),
                background_gain=1.1,
            )

    def test_focus_mix_rejects_background_dominated_output(self):
        sample_rate = 1000
        time = np.arange(sample_rate * 2) / sample_rate
        background = (0.2 * np.sin(2 * np.pi * 90 * time)).astype(np.float32)
        silent_guitar = np.zeros_like(background)

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            background_path = root / "background.wav"
            guitar_path = root / "guitar.wav"
            output_path = root / "focus.wav"
            sf.write(background_path, background, sample_rate)
            sf.write(guitar_path, silent_guitar, sample_rate)

            report = build_guitar_focus_mix(
                background_path,
                guitar_path,
                output_path,
            )

            self.assertFalse(report["passed"])
            self.assertEqual(report["foreground_energy_ratio"], 0.0)

    def test_focus_mix_aligns_model_audio_to_source_sample_rate(self):
        source_rate = 48000
        model_rate = 44100
        source_time = np.arange(source_rate) / source_rate
        model_time = np.arange(model_rate) / model_rate
        original = (0.1 * np.sin(2 * np.pi * 120 * source_time)).astype(np.float32)
        guitar = (0.1 * np.sin(2 * np.pi * 120 * model_time)).astype(np.float32)

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            original_path = root / "original.wav"
            guitar_path = root / "guitar.wav"
            output_path = root / "focus.wav"
            sf.write(original_path, original, source_rate)
            sf.write(guitar_path, guitar, model_rate)

            build_guitar_focus_mix(original_path, guitar_path, output_path)
            focus, output_rate = sf.read(output_path, dtype="float32")

            self.assertEqual(output_rate, source_rate)
            self.assertEqual(len(focus), source_rate)


if __name__ == "__main__":
    unittest.main()
