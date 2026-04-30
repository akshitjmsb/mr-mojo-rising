"""Re-run BTC chord detection for an existing song and rewrite the chords table.

Used by:
  - The `/api/reanalyze-chords/{song_id}` API endpoint in `main.py`.
  - The one-time backfill script in `backfill_chords.py`.

The function downloads the song's original mix from the `stems` Supabase bucket,
runs `btc.inference.predict_chords()` on it, derives BPM with librosa, replaces
all existing chord rows for the song, and updates `songs.bpm`.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import librosa
import numpy as np
from supabase import Client

from btc.inference import predict_chords


STEM_BUCKET = "stems"


class SongNotFound(Exception):
    pass


class AudioNotFound(Exception):
    pass


def _resolve_storage_path(sb: Client, song_id: str) -> str:
    """Pick the storage object key for the song's original mix."""
    rows = (
        sb.storage.from_(STEM_BUCKET)
        .list(song_id, {"limit": 100, "search": "original"})
    )
    if not rows:
        raise AudioNotFound(f"No 'original.*' object under {STEM_BUCKET}/{song_id}/")

    preferred = ("original.mp3", "original.wav", "original.m4a", "original.ogg")
    names = {row["name"] for row in rows if row.get("name")}
    for candidate in preferred:
        if candidate in names:
            return f"{song_id}/{candidate}"

    name = rows[0]["name"]
    return f"{song_id}/{name}"


def _download_audio(sb: Client, song_id: str, dest_dir: Path) -> Path:
    storage_path = _resolve_storage_path(sb, song_id)
    suffix = Path(storage_path).suffix or ".mp3"
    local_path = dest_dir / f"{song_id}{suffix}"
    data = sb.storage.from_(STEM_BUCKET).download(storage_path)
    local_path.write_bytes(data)
    return local_path


def reanalyze_chords(sb: Client, song_id: str) -> dict:
    """Run BTC chord detection for `song_id` and replace its chord rows.

    Returns: {song_id, chord_count, bpm, storage_path}.

    Raises SongNotFound / AudioNotFound for missing inputs; lets BTC/IO errors
    bubble up so callers can surface them.
    """
    song = (
        sb.table("songs")
        .select("id, status")
        .eq("id", song_id)
        .single()
        .execute()
    )
    if not song.data:
        raise SongNotFound(f"Song {song_id} not found")

    with tempfile.TemporaryDirectory(prefix=f"reanalyze-{song_id}-") as tmp:
        tmp_dir = Path(tmp)
        audio_path = _download_audio(sb, song_id, tmp_dir)

        chords = predict_chords(str(audio_path))

        y, sr = librosa.load(str(audio_path), sr=22050, mono=True)
        tempo_raw, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = round(float(np.atleast_1d(tempo_raw)[0]), 2)

    sb.table("chords").delete().eq("song_id", song_id).execute()
    if chords:
        sb.table("chords").insert(
            [
                {
                    "song_id": song_id,
                    "start_time": chord["start"],
                    "end_time": chord["end"],
                    "chord_label": chord["label"],
                    "chord_standard": chord["standard"],
                    "confidence": chord["confidence"],
                }
                for chord in chords
            ]
        ).execute()

    sb.table("songs").update({"bpm": bpm}).eq("id", song_id).execute()

    return {
        "song_id": song_id,
        "chord_count": len(chords),
        "bpm": bpm,
    }
