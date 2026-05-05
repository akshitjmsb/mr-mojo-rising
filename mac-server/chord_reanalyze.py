"""Re-run BTC chord detection for an existing song and rewrite the chords table.

Used by:
  - The `/api/reanalyze-chords/{song_id}` API endpoint in `main.py`.
  - The one-time backfill script in `backfill_chords.py`.

The function pulls the song's `original_url` from the `stems` row, downloads
the audio from Vercel Blob, runs `btc.inference.predict_chords()` on it,
derives BPM with librosa, replaces all existing chord rows for the song, and
updates `songs.bpm`.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import librosa
import numpy as np

from blob_storage import download_url
from btc.inference import predict_chords
from turso_db import get_client, new_id


class SongNotFound(Exception):
    pass


class AudioNotFound(Exception):
    pass


def reanalyze_chords(song_id: str) -> dict:
    """Run BTC chord detection for `song_id` and replace its chord rows.

    Returns: {song_id, chord_count, bpm}.

    Raises SongNotFound / AudioNotFound for missing inputs; lets BTC/IO errors
    bubble up so callers can surface them.
    """
    db = get_client()
    song = db.query_one("SELECT id, status FROM songs WHERE id = ?", [song_id])
    if not song:
        raise SongNotFound(f"Song {song_id} not found")

    stems = db.query_one(
        "SELECT original_url FROM stems WHERE song_id = ?",
        [song_id],
    )
    if not stems or not stems.get("original_url"):
        raise AudioNotFound(f"No original audio URL for song {song_id}")

    original_url = stems["original_url"]

    with tempfile.TemporaryDirectory(prefix=f"reanalyze-{song_id}-") as tmp:
        tmp_dir = Path(tmp)
        suffix = Path(original_url.split("?")[0]).suffix or ".mp3"
        audio_path = tmp_dir / f"{song_id}{suffix}"
        download_url(original_url, audio_path)

        chords = predict_chords(str(audio_path))

        y, sr = librosa.load(str(audio_path), sr=22050, mono=True)
        tempo_raw, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = round(float(np.atleast_1d(tempo_raw)[0]), 2)

    db.execute("DELETE FROM chords WHERE song_id = ?", [song_id])
    for chord in chords or []:
        db.execute(
            """INSERT INTO chords
               (id, song_id, start_time, end_time, chord_label, chord_standard, confidence)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            [
                new_id(),
                song_id,
                chord["start"],
                chord["end"],
                chord["label"],
                chord["standard"],
                chord["confidence"],
            ],
        )

    db.execute(
        "UPDATE songs SET bpm = ?, updated_at = unixepoch() WHERE id = ?",
        [bpm, song_id],
    )

    return {
        "song_id": song_id,
        "chord_count": len(chords or []),
        "bpm": bpm,
    }
