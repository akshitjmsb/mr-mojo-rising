"""Resilient yt-dlp command construction and runtime discovery.

YouTube changes its player challenges independently of our release cycle.  Keep
all of that volatility at this boundary so the audio pipeline only ever sees a
validated WAV file.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class JavaScriptRuntime:
    name: str
    path: str
    version: str

    @property
    def ytdlp_arg(self) -> str:
        return f"{self.name}:{self.path}"


@dataclass(frozen=True)
class DownloadAttempt:
    name: str
    command: list[str]


def _version_tuple(value: str) -> tuple[int, ...]:
    match = re.search(r"(\d+)(?:\.(\d+))?(?:\.(\d+))?", value)
    if not match:
        return ()
    return tuple(int(part or 0) for part in match.groups())


def _runtime(path: str, name: str, minimum: tuple[int, ...]) -> JavaScriptRuntime | None:
    try:
        result = subprocess.run(
            [path, "--version"],
            capture_output=True,
            check=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    version = (result.stdout or result.stderr).splitlines()[0].strip()
    if _version_tuple(version) < minimum:
        return None
    return JavaScriptRuntime(name=name, path=str(Path(path).resolve()), version=version)


def discover_javascript_runtime(
    configured: str | None = None,
) -> JavaScriptRuntime | None:
    """Return a supported yt-dlp EJS runtime, preferring Deno then Node."""
    configured = (configured or os.environ.get("YTDLP_JS_RUNTIME", "")).strip()
    if configured:
        name, separator, configured_path = configured.partition(":")
        name = name.strip().lower()
        path = configured_path.strip() if separator else shutil.which(name)
        minimum = {"deno": (2, 3, 0), "node": (22, 0, 0)}.get(name)
        if minimum and path:
            return _runtime(path, name, minimum)
        return None

    for name, minimum in (("deno", (2, 3, 0)), ("node", (22, 0, 0))):
        path = shutil.which(name)
        if path and (runtime := _runtime(path, name, minimum)):
            return runtime
    return None


def command_prefix(command: str | list[str]) -> list[str]:
    """Keep paths containing spaces intact; never parse commands through a shell."""
    return [command] if isinstance(command, str) else list(command)


def ytdlp_command(python: str = sys.executable, configured: str | None = None) -> list[str]:
    """Console-script shebangs retain old venv paths after a folder move.

    Run the installed module with the active interpreter instead. An explicitly
    configured executable is used only if it actually runs, not just exists.
    """
    if configured and ytdlp_version(configured):
        return [configured]
    return [python, "-m", "yt_dlp"]


def ytdlp_version(ytdlp_bin: str | list[str]) -> str | None:
    try:
        result = subprocess.run(
            [*command_prefix(ytdlp_bin), "--version"],
            capture_output=True,
            check=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return result.stdout.strip() or None


def build_download_attempts(
    *,
    ytdlp_bin: str | list[str],
    runtime: JavaScriptRuntime,
    output_template: Path,
    youtube_url: str,
    cookies_from_browser: str = "",
) -> list[DownloadAttempt]:
    """Build quality-equivalent attempts using independent YouTube clients.

    web_safari provides HLS formats while web_embedded is a useful fallback for
    videos that do not require standard web-client proof-of-origin tokens.
    Each is attempted separately to avoid cross-client token/URL mismatches.
    """
    prefix = command_prefix(ytdlp_bin)
    common = [
        *prefix,
        "--ignore-config",
        "--js-runtimes",
        runtime.ytdlp_arg,
        "--remote-components",
        "ejs:github",
        "--retries",
        "3",
        "--fragment-retries",
        "3",
        "--retry-sleep",
        "1",
        "--socket-timeout",
        "30",
        "--no-playlist",
        "--force-overwrites",
        "--write-info-json",
        "-f",
        "bestaudio/best",
        "-x",
        "--audio-format",
        "wav",
        "--audio-quality",
        "0",
        "-o",
        str(output_template),
    ]
    if cookies_from_browser:
        common[len(prefix):len(prefix)] = ["--cookies-from-browser", cookies_from_browser]

    clients: tuple[tuple[str, str | None], ...] = (
        ("default", None),
        ("web_safari_hls", "web_safari"),
        ("web_embedded", "web_embedded"),
    )
    attempts: list[DownloadAttempt] = []
    for name, client in clients:
        command = list(common)
        if client:
            command[len(prefix):len(prefix)] = [
                "--extractor-args",
                f"youtube:player_client={client}",
            ]
        command.append(youtube_url)
        attempts.append(DownloadAttempt(name=name, command=command))
    return attempts


def is_recoverable_download_failure(stderr: str) -> bool:
    normalized = stderr.lower()
    permanent_markers = (
        "private video",
        "video unavailable",
        "has been removed",
        "copyright claim",
        "members-only",
        "sign in to confirm your age",
    )
    if any(marker in normalized for marker in permanent_markers):
        return False
    return any(
        marker in normalized
        for marker in (
            "http error 403",
            "no supported javascript runtime",
            "signature solving failed",
            "nsig extraction failed",
            "requested format is not available",
        )
    )
