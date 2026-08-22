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
    ensure_lyrics_revisions_table()
    row = db.query_one(
        """SELECT l.*, s.vocals_url, s.original_url
           FROM lyrics l
           INNER JOIN stems s ON s.song_id = l.song_id
           WHERE l.song_id = ?""",
        [args.song_id],
    )
    if not row or not row.get("vocals_url"):
        raise SystemExit("Song lyrics or vocal stem not found")
    current_lyrics = {
        "synced_lrc": row.get("synced_lrc"),
        "plain_text": row.get("plain_text"),
        "source": row.get("source") or "unknown",
    }
    if str(row.get("source") or "").startswith("local-vocal-align/"):
        catalog_revision = db.query_one(
            """SELECT synced_lrc, plain_text, source
               FROM lyrics_revisions
               WHERE song_id = ?
                 AND source NOT LIKE 'local-vocal-align/%'
               ORDER BY created_at DESC
               LIMIT 1""",
            [args.song_id],
        )
        if catalog_revision:
            row.update(catalog_revision)

    with tempfile.TemporaryDirectory(prefix="mojo-lyrics-align-") as temp_dir:
        vocal_path = Path(temp_dir) / "vocals.mp3"
        original_path = Path(temp_dir) / "original.mp3"
        with requests.get(row["vocals_url"], stream=True, timeout=120) as response:
            response.raise_for_status()
            with vocal_path.open("wb") as output:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    output.write(chunk)
        reference_path = None
        if row.get("original_url"):
            try:
                with requests.get(
                    row["original_url"], stream=True, timeout=120
                ) as response:
                    response.raise_for_status()
                    with original_path.open("wb") as output:
                        for chunk in response.iter_content(chunk_size=1024 * 1024):
                            output.write(chunk)
                reference_path = original_path
            except requests.RequestException as error:
                print(f"Reference audio unavailable; using vocals only: {error}")
        aligned, report = align_lyrics_to_vocals(
            row,
            vocal_path,
            model=args.model,
            reference_audio_path=reference_path,
        )

    print(json.dumps(report.__dict__, indent=2))
    print(aligned["source"])
    if not report.passed:
        print("Quality gate failed; database was not changed.")
        return 2
    if not args.apply:
        print("Dry run only. Pass --apply after reviewing the quality report.")
        return 0

    db.execute_batch(
        [
            (
                """INSERT INTO lyrics_revisions
                   (id, song_id, synced_lrc, plain_text, source)
                   VALUES (?, ?, ?, ?, ?)""",
                [
                    new_id(),
                    args.song_id,
                    current_lyrics["synced_lrc"],
                    current_lyrics["plain_text"],
                    current_lyrics["source"],
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
