#!/usr/bin/env python3
"""One-time backfill: transcribe tabs for every song with status='ready'.

Run from `mac-server/`:

    ./venv/bin/python backfill_tabs.py            # all ready songs
    ./venv/bin/python backfill_tabs.py --limit 1  # one song
    ./venv/bin/python backfill_tabs.py --song-id <uuid>

Reads TURSO_DATABASE_URL / TURSO_AUTH_TOKEN / BLOB_READ_WRITE_TOKEN from the
environment, same as the worker. The script downloads each song's guitar stem
from Vercel Blob, runs basic-pitch + fret assignment, and rewrites the
tab_notes rows. Requires basic-pitch in the separator venv:

    ./venv-sep/bin/pip install "basic-pitch[onnx]"
"""

from __future__ import annotations

import argparse
import os
import sys
import time

from tab_transcribe import AudioNotFound, SongNotFound, reanalyze_tabs
from turso_db import get_client


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--song-id",
        help="Transcribe only this song id (skips the status='ready' filter).",
    )
    p.add_argument(
        "--limit",
        type=int,
        help="Process at most N songs (useful for a dry run).",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()

    if not os.environ.get("TURSO_DATABASE_URL"):
        print("TURSO_DATABASE_URL must be set", file=sys.stderr)
        return 2
    if not os.environ.get("BLOB_READ_WRITE_TOKEN"):
        print("BLOB_READ_WRITE_TOKEN must be set", file=sys.stderr)
        return 2

    db = get_client()

    if args.song_id:
        songs = [{"id": args.song_id, "title": "(forced)"}]
    else:
        sql = """SELECT id, title FROM songs
                 WHERE status = 'ready'
                 ORDER BY created_at ASC"""
        if args.limit:
            sql += f" LIMIT {int(args.limit)}"
        songs = db.execute(sql)

    if not songs:
        print("No songs to backfill.")
        return 0

    print(f"Backfilling tabs for {len(songs)} song(s)...\n")

    succeeded = 0
    skipped = 0
    failed = 0
    total_started = time.perf_counter()

    for idx, song in enumerate(songs, start=1):
        song_id = song["id"]
        title = song.get("title") or "(untitled)"
        print(f"[{idx}/{len(songs)}] {title}  ({song_id})")
        started = time.perf_counter()
        try:
            result = reanalyze_tabs(song_id)
        except (SongNotFound, AudioNotFound) as exc:
            print(f"   SKIP — {exc}")
            skipped += 1
            continue
        except Exception as exc:
            print(f"   FAIL — {type(exc).__name__}: {exc}")
            failed += 1
            continue

        elapsed = time.perf_counter() - started
        print(f"   OK   — {result['note_count']} notes, {elapsed:.1f}s")
        succeeded += 1

    total_elapsed = time.perf_counter() - total_started
    print(
        f"\nDone. ok={succeeded} skipped={skipped} failed={failed} "
        f"total={total_elapsed:.1f}s"
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
