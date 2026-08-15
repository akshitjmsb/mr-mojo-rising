import tempfile
import unittest
from pathlib import Path

from blob_storage import content_addressed_pathname


class BlobStorageTests(unittest.TestCase):
    def test_content_address_is_stable_for_identical_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            audio = Path(temp) / "stem.mp3"
            audio.write_bytes(b"same audio")

            first = content_addressed_pathname(audio, "stems/song/guitar-focus.mp3")
            second = content_addressed_pathname(audio, "stems/song/guitar-focus.mp3")

            self.assertEqual(first, second)
            self.assertRegex(first, r"guitar-focus-[0-9a-f]{12}\.mp3$")

    def test_content_address_changes_when_audio_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            audio = Path(temp) / "stem.mp3"
            audio.write_bytes(b"old audio")
            old_path = content_addressed_pathname(
                audio,
                "stems/song/guitar-focus.mp3",
            )
            audio.write_bytes(b"new audio")
            new_path = content_addressed_pathname(
                audio,
                "stems/song/guitar-focus.mp3",
            )

            self.assertNotEqual(old_path, new_path)


if __name__ == "__main__":
    unittest.main()
