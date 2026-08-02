"""Durable, versioned checkpoints for expensive audio pipeline stages."""

from __future__ import annotations

import hashlib
import json
import os
import wave
from pathlib import Path
from urllib.parse import parse_qs, urlparse


def canonicalize_youtube_url(raw_url: str) -> str:
    """Return one stable URL for supported YouTube watch/share links."""
    value = raw_url.strip()
    parsed = urlparse(value if "://" in value else f"https://{value}")
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]

    video_id = ""
    if host == "youtu.be":
        video_id = parsed.path.strip("/").split("/", 1)[0]
    elif host in {"youtube.com", "m.youtube.com", "music.youtube.com"}:
        if parsed.path == "/watch":
            video_id = parse_qs(parsed.query).get("v", [""])[0]
        elif parsed.path.startswith(("/shorts/", "/embed/", "/live/")):
            parts = parsed.path.strip("/").split("/")
            video_id = parts[1] if len(parts) > 1 else ""

    if not video_id or not all(ch.isalnum() or ch in "-_" for ch in video_id):
        raise ValueError("Unsupported YouTube URL")
    return f"https://www.youtube.com/watch?v={video_id}"


def source_cache_dir(output_dir: Path, youtube_url: str, pipeline_version: str) -> Path:
    canonical = canonicalize_youtube_url(youtube_url)
    source_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:24]
    return output_dir / "cache" / pipeline_version / source_hash


def valid_wav(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size <= 44:
        return False
    try:
        with wave.open(str(path), "rb") as wav_file:
            return wav_file.getnframes() > 0 and wav_file.getframerate() > 0
    except (EOFError, wave.Error, OSError):
        return False


class PipelineCheckpoint:
    """Small atomic JSON manifest stored beside cached source artifacts."""

    def __init__(self, work_dir: Path, pipeline_version: str):
        self.path = work_dir / ".pipeline-checkpoints.json"
        self.pipeline_version = pipeline_version
        self.data = self._load()

    def _load(self) -> dict:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            if raw.get("pipeline_version") == self.pipeline_version:
                return raw
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            pass
        return {
            "pipeline_version": self.pipeline_version,
            "compute": {},
            "uploads": {},
        }

    def compute_done(self, stage: str) -> bool:
        return bool(self.data.get("compute", {}).get(stage))

    def mark_compute(self, stage: str) -> None:
        self.data.setdefault("compute", {})[stage] = True
        self._save()

    def upload_done(self, song_id: str, stage: str) -> bool:
        return bool(self.data.get("uploads", {}).get(song_id, {}).get(stage))

    def mark_upload(self, song_id: str, stage: str) -> None:
        self.data.setdefault("uploads", {}).setdefault(song_id, {})[stage] = True
        self._save()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self.path.with_suffix(f".tmp-{os.getpid()}")
        temp_path.write_text(
            json.dumps(self.data, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        temp_path.replace(self.path)
