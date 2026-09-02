import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

from audio_quality_gate import evaluate_four_layers, evaluate_layer


class AudioQualityGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.sample_rate = 8000
        time = np.arange(self.sample_rate * 3) / self.sample_rate
        self.vocals = (0.12 * np.sin(2 * np.pi * 440 * time)).astype(np.float32)
        self.rhythm = (0.14 * np.sin(2 * np.pi * 165 * time)).astype(np.float32)
        self.lead = (0.10 * np.sin(2 * np.pi * 659.25 * time)).astype(np.float32)
        self.full = self.vocals + self.rhythm + self.lead

    def tearDown(self):
        self.temp.cleanup()

    def write(self, name: str, samples: np.ndarray) -> Path:
        path = self.root / name
        sf.write(path, samples, self.sample_rate, subtype="FLOAT")
        return path

    def test_clean_four_layer_bundle_passes(self):
        full = self.write("full.wav", self.full)
        vocals = self.write("vocals.wav", self.vocals)
        guitars = self.write("guitars.wav", self.rhythm + self.lead)
        rhythm = self.write("rhythm.wav", self.rhythm + self.lead * 0.2)
        lead = self.write("lead.wav", self.lead + self.rhythm * 0.2)

        reports = evaluate_four_layers(
            {
                "full": full,
                "vocals": vocals,
                "guitars": guitars,
                "rhythm": rhythm,
                "lead": lead,
            }
        )

        self.assertTrue(all(report["status"] == "ready" for report in reports.values()))
        self.assertTrue(
            any(
                check["key"] == "role_separation"
                for check in reports["lead"]["checks"]
            )
        )

    def test_vocal_leakage_is_playable_but_not_ready(self):
        full = self.write("full.wav", self.full)
        vocals = self.write("vocals.wav", self.vocals)
        leaked = self.write("leaked-guitar.wav", self.rhythm + self.vocals)

        report = evaluate_layer(
            "guitars",
            leaked,
            reference_path=full,
            vocals_path=vocals,
        )

        self.assertEqual(report["status"], "best_available")
        self.assertIn("Vocals may be audible", report["summary"])

    def test_different_model_sample_rates_do_not_create_false_leakage(self):
        full = self.write("full.wav", self.full)
        guitars = self.write("guitars.wav", self.rhythm + self.lead)
        vocal_rate = 11025
        vocal_time = np.arange(vocal_rate * 3) / vocal_rate
        vocals = self.write_at_rate(
            "vocals-11k.wav",
            (0.12 * np.sin(2 * np.pi * 440 * vocal_time)).astype(np.float32),
            vocal_rate,
        )

        report = evaluate_layer(
            "guitars",
            guitars,
            reference_path=full,
            vocals_path=vocals,
        )

        self.assertEqual(report["status"], "ready")

    def test_identical_role_tracks_fail_separation(self):
        full = self.write("full.wav", self.full)
        vocals = self.write("vocals.wav", self.vocals)
        role = self.write("role.wav", self.rhythm + self.lead)

        report = evaluate_layer(
            "lead",
            role,
            reference_path=full,
            vocals_path=vocals,
            role_peer_path=role,
        )

        self.assertEqual(report["status"], "best_available")
        self.assertIn("not clearly separated", report["summary"])

    def test_short_silent_layer_fails_health_checks(self):
        full = self.write("full.wav", self.full)
        short_silence = self.write(
            "short.wav",
            np.zeros(self.sample_rate, dtype=np.float32),
        )

        report = evaluate_layer("vocals", short_silence, reference_path=full)
        failed = {check["key"] for check in report["checks"] if not check["passed"]}

        self.assertEqual(report["status"], "best_available")
        self.assertEqual(failed, {"duration_sync", "signal_present"})

    def write_at_rate(self, name: str, samples: np.ndarray, rate: int) -> Path:
        path = self.root / name
        sf.write(path, samples, rate, subtype="FLOAT")
        return path


if __name__ == "__main__":
    unittest.main()
