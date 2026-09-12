import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import subprocess
from worker_runtime import acquire_worker_lock, readiness, tool_ready
from youtube_download import ytdlp_command


class WorkerRuntimeTests(unittest.TestCase):
    def test_missing_tool_is_not_ready(self):
        with patch("worker_runtime.subprocess.run", side_effect=FileNotFoundError):
            self.assertFalse(tool_ready(["missing"]))

    def test_hung_tool_is_not_ready(self):
        with patch("worker_runtime.subprocess.run", side_effect=subprocess.TimeoutExpired("tool", 1)):
            self.assertFalse(tool_ready(["tool"]))

    def test_every_dependency_required(self):
        checks = dict(downloader=True, javascript=True, ffmpeg=True, separator=True)
        self.assertTrue(readiness(**checks)["ready"])
        for key in checks:
            self.assertFalse(readiness(**{**checks, key: False})["ready"])

    def test_duplicate_worker_rejected_then_lock_released(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "worker.lock"
            first = acquire_worker_lock(path)
            try:
                with self.assertRaises(RuntimeError):
                    acquire_worker_lock(path)
            finally:
                first.close()
            acquire_worker_lock(path).close()

    def test_moved_environment_uses_module_not_stale_script(self):
        with patch("youtube_download.ytdlp_version", return_value=None):
            self.assertEqual(ytdlp_command("/project with spaces/venv/bin/python", "/old/yt-dlp"),
                             ["/project with spaces/venv/bin/python", "-m", "yt_dlp"])
