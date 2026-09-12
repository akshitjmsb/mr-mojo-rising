"""Project-local worker ownership and dependency checks (no ML imports)."""
import fcntl
import os
import subprocess
from pathlib import Path


def acquire_worker_lock(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("a+")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        raise RuntimeError("A worker already owns this project; refusing a duplicate worker") from None
    handle.seek(0)
    handle.truncate()
    handle.write(str(os.getpid()))
    handle.flush()
    return handle  # Keep open for the process lifetime; OS releases on crash.


def tool_ready(command: list[str], timeout: int = 10) -> bool:
    try:
        result = subprocess.run(command, capture_output=True, timeout=timeout, check=False)
        return result.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def readiness(*, downloader: bool, javascript: bool, ffmpeg: bool, separator: bool) -> dict:
    checks = {"downloader": downloader, "javascript": javascript, "ffmpeg": ffmpeg, "separator": separator}
    return {"ready": all(checks.values()), "checks": checks}
