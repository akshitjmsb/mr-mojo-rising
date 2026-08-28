import unittest
from pathlib import Path
from unittest.mock import patch

from youtube_download import (
    JavaScriptRuntime,
    build_download_attempts,
    discover_javascript_runtime,
    is_recoverable_download_failure,
)


class YoutubeDownloadTests(unittest.TestCase):
    def test_builds_separate_quality_equivalent_client_attempts(self):
        runtime = JavaScriptRuntime("node", "/opt/homebrew/bin/node", "v26.5.0")
        attempts = build_download_attempts(
            ytdlp_bin="/worker/yt-dlp",
            runtime=runtime,
            output_template=Path("/tmp/original.%(ext)s"),
            youtube_url="https://www.youtube.com/watch?v=test",
        )

        self.assertEqual(
            [attempt.name for attempt in attempts],
            ["default", "web_safari_hls", "web_embedded"],
        )
        for attempt in attempts:
            self.assertIn("bestaudio/best", attempt.command)
            self.assertIn("node:/opt/homebrew/bin/node", attempt.command)
            self.assertEqual(attempt.command[-1], "https://www.youtube.com/watch?v=test")

    def test_recoverability_does_not_loop_permanent_video_failures(self):
        self.assertTrue(is_recoverable_download_failure("HTTP Error 403: Forbidden"))
        self.assertFalse(is_recoverable_download_failure("ERROR: Private video"))

    @patch("youtube_download.shutil.which", return_value="/opt/homebrew/bin/node")
    @patch("youtube_download._runtime")
    def test_discovers_supported_node(self, runtime_mock, _which_mock):
        expected = JavaScriptRuntime("node", "/opt/homebrew/bin/node", "v26.5.0")
        runtime_mock.side_effect = [None, expected]
        self.assertEqual(discover_javascript_runtime(), expected)


if __name__ == "__main__":
    unittest.main()
