"""Measure and persist the four-layer quality gate for existing songs."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import requests

from audio_quality_gate import evaluate_four_layers
from pipeline_cache import source_cache_dir, valid_wav
from turso_db import ensure_stem_quality_reports_table, get_client, new_id


PIPELINE_VERSION = os.environ.get("PIPELINE_VERSION", "hq-v4-guitar-focus")
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", "/tmp/mojo-stems"))


def _download(url: str, destination: Path) -> Path:
    with requests.get(url, stream=True, timeout=(15, 180)) as response:
        response.raise_for_status()
        with destination.open("wb") as target:
            for chunk in response.iter_content(1024 * 1024):
                if chunk:
                    target.write(chunk)
    return destination


def _available_path(
    local_path: Path,
    layer: dict | None,
    temp_root: Path,
) -> Path | None:
    if valid_wav(local_path):
        return local_path
    if not layer or not layer.get("url"):
        return None
    suffix = Path(urlparse(layer["url"]).path).suffix or ".mp3"
    return _download(layer["url"], temp_root / f"{layer['layer_key']}{suffix}")


def _persist(db, song_id: str, reports: dict[str, dict], keys: dict[str, str]) -> None:
    db.execute("DELETE FROM stem_quality_reports WHERE song_id = ?", [song_id])
    db.execute(
        """UPDATE stem_layers SET quality_status = 'preview', updated_at = unixepoch()
           WHERE song_id = ? AND instrument IN ('full', 'vocals', 'guitar')""",
        [song_id],
    )
    statements = []
    for kind, report in reports.items():
        layer_key = keys[kind]
        statements.extend(
            [
                (
                    """INSERT INTO stem_quality_reports
                         (id, song_id, layer_key, status, score, summary,
                          checks_json, evidence_version, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
                       ON CONFLICT(song_id, layer_key) DO UPDATE SET
                         status = excluded.status,
                         score = excluded.score,
                         summary = excluded.summary,
                         checks_json = excluded.checks_json,
                         evidence_version = excluded.evidence_version,
                         updated_at = unixepoch()""",
                    [
                        new_id(),
                        song_id,
                        layer_key,
                        report["status"],
                        report["score"],
                        report["summary"],
                        json.dumps(
                            {"facts": report["facts"], "checks": report["checks"]},
                            separators=(",", ":"),
                        ),
                        report["evidence_version"],
                    ],
                ),
                (
                    """UPDATE stem_layers SET quality_status = ?, updated_at = unixepoch()
                       WHERE song_id = ? AND layer_key = ?""",
                    [
                        "ready" if report["status"] == "ready" else "preview",
                        song_id,
                        layer_key,
                    ],
                ),
            ]
        )
    if statements:
        db.execute_batch(statements)


def _seed_legacy_layers(db, song_id: str) -> None:
    stems = db.query_one(
        "SELECT original_url, guitar_url, vocals_url FROM stems WHERE song_id = ?",
        [song_id],
    )
    if not stems:
        return
    definitions = (
        ("full", "Full Song", "full", "all", stems.get("original_url"), 0, 0),
        ("vocals", "Vocals", "vocals", "all", stems.get("vocals_url"), 0, 1),
        ("guitars", "Guitar Focus", "guitar", "all", stems.get("guitar_url"), 1, 2),
    )
    statements = []
    for key, label, instrument, role, url, learnable, sort_order in definitions:
        if not url:
            continue
        statements.append(
            (
                """INSERT INTO stem_layers
                     (id, song_id, layer_key, label, instrument, role, url,
                      source_model, quality_status, is_learnable, sort_order,
                      updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'legacy-source', 'preview', ?, ?, unixepoch())
                   ON CONFLICT(song_id, layer_key) DO NOTHING""",
                [
                    new_id(),
                    song_id,
                    key,
                    label,
                    instrument,
                    role,
                    url,
                    learnable,
                    sort_order,
                ],
            )
        )
    if statements:
        db.execute_batch(statements)


def main() -> None:
    ensure_stem_quality_reports_table()
    db = get_client()
    songs = db.execute(
        "SELECT id, title, youtube_url FROM songs WHERE status = 'ready' ORDER BY created_at"
    )
    completed = 0
    skipped = 0
    for song in songs:
        layers = db.execute(
            """SELECT layer_key, instrument, role, url FROM stem_layers
               WHERE song_id = ? AND instrument IN ('full', 'vocals', 'guitar')""",
            [song["id"]],
        )
        if not layers:
            _seed_legacy_layers(db, song["id"])
            layers = db.execute(
                """SELECT layer_key, instrument, role, url FROM stem_layers
                   WHERE song_id = ? AND instrument IN ('full', 'vocals', 'guitar')""",
                [song["id"]],
            )
        by_kind: dict[str, dict] = {}
        for layer in layers:
            if layer["instrument"] == "full":
                by_kind["full"] = layer
            elif layer["instrument"] == "vocals":
                by_kind["vocals"] = layer
            elif layer["role"] == "lead":
                by_kind["lead"] = layer
            elif layer["role"] == "rhythm":
                by_kind["rhythm"] = layer
            elif layer["instrument"] == "guitar":
                by_kind["guitars"] = layer
        if "full" not in by_kind:
            skipped += 1
            print(f"SKIP {song['title']}: no full-song layer")
            continue

        cache = source_cache_dir(OUTPUT_DIR, song["youtube_url"], PIPELINE_VERSION)
        local = {
            "full": cache / "original.wav",
            "vocals": cache / "stems" / "vocals.wav",
            "guitars": cache / "stems" / "guitar-focus.wav",
            "lead": cache / "stems" / "lead-focus.wav",
            "rhythm": cache / "stems" / "rhythm-focus.wav",
        }
        with tempfile.TemporaryDirectory(prefix="mojo-quality-") as temp:
            temp_root = Path(temp)
            paths = {
                kind: path
                for kind in by_kind
                if (path := _available_path(local[kind], by_kind[kind], temp_root))
            }
            if "full" not in paths:
                skipped += 1
                print(f"SKIP {song['title']}: source audio unavailable")
                continue
            reports = evaluate_four_layers(paths)
            _persist(
                db,
                song["id"],
                reports,
                {kind: layer["layer_key"] for kind, layer in by_kind.items()},
            )
            completed += 1
            states = ", ".join(
                f"{kind}={report['status']}({report['score']:.0f})"
                for kind, report in reports.items()
            )
            print(f"OK {song['title']}: {states}")

    print(f"Quality backfill complete: {completed} measured, {skipped} skipped")


if __name__ == "__main__":
    main()
