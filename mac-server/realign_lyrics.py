#!/usr/bin/env python3
"""Re-align an existing song's lyrics against its published vocal stem."""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

import requests

from lyrics_align import DEFAULT_MODEL, align_lyrics_to_vocals
from turso_db import ensure_lyrics_revisions_table, get_client, new_id


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("song_id")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    db = get_client()
    row = db.query_one(
        """SELECT l.*, s.vocals_url
           FROM lyrics l
           INNER JOIN stems s ON s.song_id = l.song_id
           WHERE l.song_id = ?""",
        [args.song_id],
    )
    if not row or not row.get("vocals_url"):
        raise SystemExit("Song lyrics or vocal stem not found")

    with tempfile.TemporaryDirectory(prefix="mojo-lyrics-align-") as temp_dir:
        vocal_path = Path(temp_dir) / "vocals.mp3"
        with requests.get(row["vocals_url"], stream=True, timeout=120) as response:
            response.raise_for_status()
            with vocal_path.open("wb") as output:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    output.write(chunk)
        aligned, report = align_lyrics_to_vocals(row, vocal_path, model=args.model)

    print(json.dumps(report.__dict__, indent=2))
    print(aligned["source"])
    if not report.passed:
        print("Quality gate failed; database was not changed.")
        return 2
    if not args.apply:
        print("Dry run only. Pass --apply after reviewing the quality report.")
        return 0

    ensure_lyrics_revisions_table()
    db.execute_batch(
        [
            (
                """INSERT INTO lyrics_revisions
                   (id, song_id, synced_lrc, plain_text, source)
                   VALUES (?, ?, ?, ?, ?)""",
                [
                    new_id(),
                    args.song_id,
                    row.get("synced_lrc"),
                    row.get("plain_text"),
                    row.get("source") or "unknown",
                ],
            ),
            (
                """UPDATE lyrics
                   SET synced_lrc = ?, plain_text = ?, source = ?
                   WHERE song_id = ?""",
                [
                    aligned["synced_lrc"],
                    aligned["plain_text"],
                    aligned["source"],
                    args.song_id,
                ],
            ),
        ]
    )
    print("Aligned lyrics saved. Previous timeline preserved in lyrics_revisions.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
