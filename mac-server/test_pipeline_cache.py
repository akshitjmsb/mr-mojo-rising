import tempfile
import unittest
import wave
from pathlib import Path

from pipeline_cache import (
    PipelineCheckpoint,
    canonicalize_youtube_url,
    source_cache_dir,
    valid_wav,
)


class PipelineCacheTests(unittest.TestCase):
    def test_canonicalizes_share_and_watch_urls(self):
        expected = "https://www.youtube.com/watch?v=_Ohx6vcYnHk"
        self.assertEqual(
            canonicalize_youtube_url(
                "https://youtu.be/_Ohx6vcYnHk?si=tracking-value"
            ),
            expected,
        )
        self.assertEqual(
            canonicalize_youtube_url(
                "https://www.youtube.com/watch?v=_Ohx6vcYnHk&list=ignored"
            ),
            expected,
        )

    def test_source_cache_is_versioned_and_ignores_tracking_parameters(self):
        root = Path("/tmp/mojo-test")
        shared = source_cache_dir(
            root,
            "https://youtu.be/_Ohx6vcYnHk?si=one",
            "pipeline-v1",
        )
        canonical = source_cache_dir(
            root,
            "https://www.youtube.com/watch?v=_Ohx6vcYnHk",
            "pipeline-v1",
        )
        upgraded = source_cache_dir(
            root,
            "https://www.youtube.com/watch?v=_Ohx6vcYnHk",
            "pipeline-v2",
        )
        self.assertEqual(shared, canonical)
        self.assertNotEqual(canonical, upgraded)

    def test_checkpoint_separates_compute_from_song_specific_uploads(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            checkpoint = PipelineCheckpoint(work_dir, "pipeline-v1")
            checkpoint.mark_compute("separate")
            checkpoint.mark_upload("song-a", "preview")

            reloaded = PipelineCheckpoint(work_dir, "pipeline-v1")
            self.assertTrue(reloaded.compute_done("separate"))
            self.assertTrue(reloaded.upload_done("song-a", "preview"))
            self.assertFalse(reloaded.upload_done("song-b", "preview"))

            upgraded = PipelineCheckpoint(work_dir, "pipeline-v2")
            self.assertFalse(upgraded.compute_done("separate"))

    def test_valid_wav_rejects_partial_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            partial = work_dir / "partial.wav"
            partial.write_bytes(b"not-a-wave")
            self.assertFalse(valid_wav(partial))

            complete = work_dir / "complete.wav"
            with wave.open(str(complete), "wb") as wav_file:
                wav_file.setnchannels(2)
                wav_file.setsampwidth(2)
                wav_file.setframerate(44100)
                wav_file.writeframes(b"\x00\x00\x00\x00" * 100)
            self.assertTrue(valid_wav(complete))


if __name__ == "__main__":
    unittest.main()
