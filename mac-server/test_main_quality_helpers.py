import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

from main import extract_title_artist, find_separator_stems, preserve_vocal_coverage


class MainQualityHelperTests(unittest.TestCase):
    def test_title_artist_uses_uploader_to_detect_song_first_title(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            (path / "original.info.json").write_text(
                json.dumps(
                    {
                        "title": "Jaanay Na Koi - Ali Zafar",
                        "uploader": "Ali Zafar",
                    }
                ),
                encoding="utf-8",
            )

            self.assertEqual(
                extract_title_artist(path),
                ("Jaanay Na Koi", "Ali Zafar"),
            )

    def test_title_artist_keeps_artist_first_titles(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            (path / "original.info.json").write_text(
                json.dumps(
                    {
                        "title": "Guns N' Roses - Patience",
                        "uploader": "Guns N' Roses",
                    }
                ),
                encoding="utf-8",
            )

            self.assertEqual(
                extract_title_artist(path),
                ("Patience", "Guns N' Roses"),
            )

    def test_vocal_coverage_restores_a_dropped_phrase(self):
        sample_rate = 1000
        seconds = 4
        time = np.arange(sample_rate * seconds) / sample_rate
        broad = (0.2 * np.sin(2 * np.pi * 120 * time)).astype(np.float32)
        clean = broad.copy()
        clean[sample_rate : sample_rate * 3] = 0

        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            clean_path = path / "clean.wav"
            broad_path = path / "broad.wav"
            output_path = path / "combined.wav"
            sf.write(clean_path, clean, sample_rate)
            sf.write(broad_path, broad, sample_rate)

            restored = preserve_vocal_coverage(
                clean_path,
                broad_path,
                output_path,
            )
            combined, _ = sf.read(output_path, dtype="float32")

            self.assertGreaterEqual(restored, 2)
            self.assertGreater(
                float(np.sqrt(np.mean(combined[sample_rate : sample_rate * 3] ** 2))),
                0.08,
            )

    def test_six_stem_separator_outputs_are_found_by_label(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            samples = np.zeros(1000, dtype=np.float32)
            for stem in ("vocals", "drums", "bass", "guitar", "piano", "other"):
                sf.write(root / f"song_({stem.title()})_model.wav", samples, 1000)

            found = find_separator_stems(root)

            self.assertEqual(
                set(found),
                {"vocals", "drums", "bass", "guitar", "piano", "other"},
            )


if __name__ == "__main__":
    unittest.main()
