"""Re-run candidate detection and the audio-derived chord truth gate.

Used by:
  - The `/api/reanalyze-chords/{song_id}` API endpoint in `main.py`.
  - The one-time backfill script in `backfill_chords.py`.

The function downloads only the song audio and separated stems already created
by this product. It never fetches web tabs or third-party song annotations.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import librosa
import numpy as np

from blob_storage import download_url
from btc.inference import predict_chords
from chord_truth_gate import verify_chord_candidates, verified_count
from turso_db import (
    ensure_chord_verifications_table,
    get_client,
    write_chord_analysis,
)


class SongNotFound(Exception):
    pass


class AudioNotFound(Exception):
    pass


def reanalyze_chords(song_id: str) -> dict:
    """Run BTC chord detection for `song_id` and replace its chord rows.

    Returns candidate, verified, and withheld counts plus BPM.

    Raises SongNotFound / AudioNotFound for missing inputs; lets BTC/IO errors
    bubble up so callers can surface them.
    """
    db = get_client()
    song = db.query_one("SELECT id, status FROM songs WHERE id = ?", [song_id])
    if not song:
        raise SongNotFound(f"Song {song_id} not found")

    stems = db.query_one(
        "SELECT original_url, guitar_url, bass_url FROM stems WHERE song_id = ?",
        [song_id],
    )
    if not stems or not stems.get("original_url"):
        raise AudioNotFound(f"No original audio URL for song {song_id}")
    if not stems.get("guitar_url"):
        raise AudioNotFound(f"No separated guitar audio URL for song {song_id}")

    original_url = stems["original_url"]

    with tempfile.TemporaryDirectory(prefix=f"reanalyze-{song_id}-") as tmp:
        tmp_dir = Path(tmp)
        suffix = Path(original_url.split("?")[0]).suffix or ".mp3"
        audio_path = tmp_dir / f"{song_id}{suffix}"
        download_url(original_url, audio_path)

        guitar_url = stems["guitar_url"]
        guitar_suffix = Path(guitar_url.split("?")[0]).suffix or ".wav"
        guitar_path = tmp_dir / f"{song_id}-guitar{guitar_suffix}"
        download_url(guitar_url, guitar_path)

        bass_path: Path | None = None
        if stems.get("bass_url"):
            bass_url = stems["bass_url"]
            bass_suffix = Path(bass_url.split("?")[0]).suffix or ".wav"
            bass_path = tmp_dir / f"{song_id}-bass{bass_suffix}"
            download_url(bass_url, bass_path)

        candidates = predict_chords(str(audio_path))
        chords = verify_chord_candidates(
            candidates,
            guitar_audio_path=str(guitar_path),
            bass_audio_path=str(bass_path) if bass_path else None,
        )

        y, sr = librosa.load(str(audio_path), sr=22050, mono=True)
        tempo_raw, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = round(float(np.atleast_1d(tempo_raw)[0]), 2)

    ensure_chord_verifications_table()
    write_chord_analysis(db, song_id, chords or [])

    db.execute(
        "UPDATE songs SET bpm = ?, updated_at = unixepoch() WHERE id = ?",
        [bpm, song_id],
    )

    return {
        "song_id": song_id,
        "chord_count": verified_count(chords or []),
        "candidate_count": len(chords or []),
        "verified_count": verified_count(chords or []),
        "withheld_count": len(chords or []) - verified_count(chords or []),
        "bpm": bpm,
    }
