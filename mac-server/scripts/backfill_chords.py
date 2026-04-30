#!/usr/bin/env python3
"""
One-time backfill: re-run BTC chord detection for every song with status='ready'.

Run from `mac-server/` so the imports resolve:

    ./venv/bin/python scripts/backfill_chords.py            # all ready songs
    ./venv/bin/python scripts/backfill_chords.py --limit 1  # one song
    ./venv/bin/python scripts/backfill_chords.py --song-id <uuid>

Reads SUPABASE_URL / SUPABASE_SERVICE_KEY from the environment, same as the
worker. The script downloads each song's original mix from the `stems` bucket,
runs the BTC transformer, and rewrites the chords + bpm rows.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

# Allow `python scripts/backfill_chords.py` from the mac-server/ directory.
HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parent.parent))

from supabase import create_client  # noqa: E402

from chord_reanalyze import AudioNotFound, SongNotFound, reanalyze_chords  # noqa: E402


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--song-id",
        help="Re-analyze only this song id (skips the status='ready' filter).",
    )
    p.add_argument(
        "--limit",
        type=int,
        help="Process at most N songs (useful for a dry run).",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set", file=sys.stderr)
        return 2

    sb = create_client(url, key)

    if args.song_id:
        songs = [{"id": args.song_id, "title": "(forced)", "status": "?"}]
    else:
        query = (
            sb.table("songs")
            .select("id, title, status")
            .eq("status", "ready")
            .order("created_at", desc=False)
        )
        if args.limit:
            query = query.limit(args.limit)
        songs = query.execute().data or []

    if not songs:
        print("No songs to backfill.")
        return 0

    print(f"Backfilling {len(songs)} song(s)...\n")

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
            result = reanalyze_chords(sb, song_id)
        except SongNotFound as exc:
            print(f"   SKIP — {exc}")
            skipped += 1
            continue
        except AudioNotFound as exc:
            print(f"   SKIP — {exc}")
            skipped += 1
            continue
        except Exception as exc:
            print(f"   FAIL — {type(exc).__name__}: {exc}")
            failed += 1
            continue

        elapsed = time.perf_counter() - started
        print(
            f"   OK   — {result['chord_count']} chords, "
            f"bpm={result['bpm']}, {elapsed:.1f}s"
        )
        succeeded += 1

    total_elapsed = time.perf_counter() - total_started
    print(
        f"\nDone. ok={succeeded} skipped={skipped} failed={failed} "
        f"total={total_elapsed:.1f}s"
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
