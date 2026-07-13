"""Guitar-stem note transcription → tablature positions.

Turns the isolated guitar stem into `tab_notes` rows: note events from
Spotify's basic-pitch model, mapped to string/fret positions with a small
Viterbi pass that keeps the fretting hand from teleporting.

basic-pitch runs as a CLI subprocess out of the separator venv (its runtime
deps are isolated from the worker's torch stack, same as audio-separator):

    ./venv-sep/bin/pip install "basic-pitch[onnx]"

Used by:
  - The `transcribe` stage in `main.py`'s pipeline (non-fatal).
  - The one-time backfill in `backfill_tabs.py`.
"""

from __future__ import annotations

import csv
import math
import os
import subprocess
import tempfile
from pathlib import Path

from blob_storage import download_url
from turso_db import TursoClient, get_client, new_id


class SongNotFound(Exception):
    pass


class AudioNotFound(Exception):
    pass


BASIC_PITCH_BIN = os.environ.get(
    "BASIC_PITCH_BIN",
    str(Path(__file__).resolve().parent / "venv-sep" / "bin" / "basic-pitch"),
)
# Higher-than-default thresholds: a practice tab wants clean, confident notes,
# not every bleed artifact the model can hear.
TAB_ONSET_THRESHOLD = float(os.environ.get("TAB_ONSET_THRESHOLD", "0.6"))
TAB_FRAME_THRESHOLD = float(os.environ.get("TAB_FRAME_THRESHOLD", "0.4"))
# 70 ms keeps 16th-note runs at solo tempos while dropping detector chatter.
TAB_MIN_NOTE_MS = float(os.environ.get("TAB_MIN_NOTE_MS", "70"))
TAB_TIMEOUT_SECONDS = int(os.environ.get("TAB_TIMEOUT_SECONDS", "600"))

# Standard tuning, tab convention: string 1 = high E … string 6 = low E.
STRING_OPEN_MIDI = [64, 59, 55, 50, 45, 40]
MAX_FRET = 24
MIN_PITCH = min(STRING_OPEN_MIDI)
MAX_PITCH = max(STRING_OPEN_MIDI) + MAX_FRET


def run_basic_pitch(audio_path: str, out_dir: Path) -> Path:
    """Run the basic-pitch CLI and return the note-events CSV it wrote."""
    if not Path(BASIC_PITCH_BIN).exists():
        raise RuntimeError(
            f"basic-pitch not found at {BASIC_PITCH_BIN} — "
            'install with: ./venv-sep/bin/pip install "basic-pitch[onnx]"'
        )
    cmd = [
        BASIC_PITCH_BIN,
        str(out_dir),
        str(audio_path),
        "--save-note-events",
        "--onset-threshold",
        str(TAB_ONSET_THRESHOLD),
        "--frame-threshold",
        str(TAB_FRAME_THRESHOLD),
        "--minimum-note-length",
        str(TAB_MIN_NOTE_MS),
        "--minimum-frequency",
        "70",
        "--maximum-frequency",
        "1400",
    ]
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=TAB_TIMEOUT_SECONDS,
    )
    if result.returncode != 0:
        tail = (result.stderr or result.stdout or "").strip()[-500:]
        raise RuntimeError(f"basic-pitch failed (exit {result.returncode}): {tail}")

    csv_files = sorted(out_dir.glob("*.csv"))
    if not csv_files:
        raise RuntimeError("basic-pitch produced no note-events CSV")
    return csv_files[0]


def parse_note_events(csv_path: Path) -> list[dict]:
    """Parse basic-pitch note events into
    [{start, duration, pitch, confidence}, ...] sorted by start time."""
    notes: list[dict] = []
    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            try:
                start = float(row["start_time_s"])
                end = float(row["end_time_s"])
                pitch = int(round(float(row["pitch_midi"])))
                velocity = float(row.get("velocity", 80) or 80)
            except (KeyError, ValueError):
                continue
            if end <= start:
                continue
            if pitch < MIN_PITCH or pitch > MAX_PITCH:
                continue
            notes.append(
                {
                    "start": round(start, 3),
                    "duration": round(end - start, 3),
                    "pitch": pitch,
                    "confidence": round(min(1.0, max(0.0, velocity / 127.0)), 3),
                }
            )
    notes.sort(key=lambda n: (n["start"], n["pitch"]))
    return notes


def _candidates(pitch: int) -> list[tuple[int, int]]:
    """Playable (string_num, fret) positions for a MIDI pitch."""
    out = []
    for i, open_midi in enumerate(STRING_OPEN_MIDI):
        fret = pitch - open_midi
        if 0 <= fret <= MAX_FRET:
            out.append((i + 1, fret))
    return out


def _local_cost(fret: int) -> float:
    # Open strings are free; lower positions are gently preferred; the dusty
    # end past fret 12 is increasingly unlikely in a transcription.
    if fret == 0:
        return 0.0
    return 0.1 + fret * 0.03 + max(0, fret - 12) * 0.4


def _transition_cost(
    prev: tuple[int, int], cur: tuple[int, int], gap_seconds: float
) -> float:
    prev_string, prev_fret = prev
    cur_string, cur_fret = cur
    # Open strings don't move the hand, so they don't contribute distance.
    fret_dist = (
        abs(cur_fret - prev_fret) if prev_fret > 0 and cur_fret > 0 else 0.0
    )
    string_dist = abs(cur_string - prev_string)
    # Movement matters less the more time the hand has to travel.
    decay = math.exp(-max(gap_seconds, 0.0) / 1.5)
    return (fret_dist * 1.0 + string_dist * 0.25) * decay


def assign_positions(notes: list[dict]) -> list[dict]:
    """Viterbi assignment of (string, fret) per note, minimizing hand travel.

    Returns the notes with `string_num` and `fret` added; notes with no
    playable position are dropped.
    """
    playable = [n for n in notes if _candidates(n["pitch"])]
    if not playable:
        return []

    # states[i] = candidate list for note i; dp[i][j] = (cost, backpointer)
    states = [_candidates(n["pitch"]) for n in playable]
    dp: list[list[tuple[float, int]]] = [
        [(_local_cost(fret), -1) for (_s, fret) in states[0]]
    ]
    for i in range(1, len(playable)):
        gap = max(0.0, playable[i]["start"] - playable[i - 1]["start"])
        row: list[tuple[float, int]] = []
        for cur in states[i]:
            best_cost = math.inf
            best_prev = -1
            for j, prev in enumerate(states[i - 1]):
                cost = dp[i - 1][j][0] + _transition_cost(prev, cur, gap)
                if cost < best_cost:
                    best_cost = cost
                    best_prev = j
            row.append((best_cost + _local_cost(cur[1]), best_prev))
        dp.append(row)

    # Backtrack.
    idx = min(range(len(dp[-1])), key=lambda j: dp[-1][j][0])
    chosen = [0] * len(playable)
    for i in range(len(playable) - 1, -1, -1):
        chosen[i] = idx
        idx = dp[i][idx][1]

    out = []
    for i, (note, state_idx) in enumerate(zip(playable, chosen)):
        string_num, fret = states[i][state_idx]
        out.append({**note, "string_num": string_num, "fret": fret})

    _resolve_same_string_collisions(out)
    return out


def _resolve_same_string_collisions(notes: list[dict], window: float = 0.04) -> None:
    """Two simultaneous notes can't share a string — move the later one to its
    next-best position when the Viterbi path stacked them."""
    i = 0
    while i < len(notes):
        j = i + 1
        used = {notes[i]["string_num"]}
        while j < len(notes) and notes[j]["start"] - notes[i]["start"] <= window:
            if notes[j]["string_num"] in used:
                for string_num, fret in _candidates(notes[j]["pitch"]):
                    if string_num not in used:
                        notes[j]["string_num"] = string_num
                        notes[j]["fret"] = fret
                        break
            used.add(notes[j]["string_num"])
            j += 1
        i += 1


def transcribe_guitar_stem(audio_path: str) -> list[dict]:
    """Full transcription: audio file → positioned tab notes."""
    with tempfile.TemporaryDirectory(prefix="basic-pitch-") as tmp:
        csv_path = run_basic_pitch(audio_path, Path(tmp))
        notes = parse_note_events(csv_path)
    return assign_positions(notes)


ENSURE_TAB_NOTES_SQL = [
    """CREATE TABLE IF NOT EXISTS tab_notes (
        id TEXT PRIMARY KEY,
        song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        start_time REAL NOT NULL,
        duration REAL NOT NULL,
        midi_pitch INTEGER NOT NULL,
        string_num INTEGER NOT NULL CHECK (string_num BETWEEN 1 AND 6),
        fret INTEGER NOT NULL CHECK (fret BETWEEN 0 AND 24),
        confidence REAL
    )""",
    """CREATE INDEX IF NOT EXISTS tab_notes_song_start_idx
        ON tab_notes (song_id, start_time)""",
]


def write_tab_notes(db: TursoClient, song_id: str, notes: list[dict]) -> None:
    """Replace all tab_notes rows for a song (idempotent re-runs)."""
    for stmt in ENSURE_TAB_NOTES_SQL:
        db.execute(stmt)
    db.execute("DELETE FROM tab_notes WHERE song_id = ?", [song_id])

    insert_sql = """INSERT INTO tab_notes
        (id, song_id, start_time, duration, midi_pitch, string_num, fret, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)"""
    batch: list[tuple[str, list]] = []
    for n in notes:
        batch.append(
            (
                insert_sql,
                [
                    new_id(),
                    song_id,
                    n["start"],
                    n["duration"],
                    n["pitch"],
                    n["string_num"],
                    n["fret"],
                    n["confidence"],
                ],
            )
        )
        if len(batch) >= 100:
            db.execute_batch(batch)
            batch = []
    if batch:
        db.execute_batch(batch)


def reanalyze_tabs(song_id: str) -> dict:
    """Re-transcribe an existing song's guitar stem and rewrite tab_notes.

    Returns {song_id, note_count}. Raises SongNotFound / AudioNotFound for
    missing inputs; transcription errors bubble up.
    """
    db = get_client()
    song = db.query_one("SELECT id FROM songs WHERE id = ?", [song_id])
    if not song:
        raise SongNotFound(f"Song {song_id} not found")

    stems = db.query_one(
        "SELECT guitar_url FROM stems WHERE song_id = ?", [song_id]
    )
    if not stems or not stems.get("guitar_url"):
        raise AudioNotFound(f"No guitar stem URL for song {song_id}")

    guitar_url = stems["guitar_url"]
    with tempfile.TemporaryDirectory(prefix=f"tabs-{song_id}-") as tmp:
        tmp_dir = Path(tmp)
        suffix = Path(guitar_url.split("?")[0]).suffix or ".mp3"
        audio_path = tmp_dir / f"{song_id}{suffix}"
        download_url(guitar_url, audio_path)
        notes = transcribe_guitar_stem(str(audio_path))

    write_tab_notes(db, song_id, notes)
    return {"song_id": song_id, "note_count": len(notes)}
