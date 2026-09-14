"""Backfill one existing song's mix only; never replace standalone vocals."""
import json
import sys
from pathlib import Path
from accompaniment_mix import render_accompaniment
from blob_storage import download_url
from main import get_turso_client, upload_file_sync, upsert_stem_layers


def main(song_id):
    import uuid
    uuid.UUID(song_id)
    db = get_turso_client()
    stems = db.query_one("SELECT vocals_url,guitar_url FROM stems WHERE song_id = ?", [song_id])
    if not stems or not all(stems.values()):
        raise ValueError("Both source stems are required")
    rhythm = db.query_one("SELECT url FROM stem_layers WHERE song_id = ? AND role = 'rhythm' AND quality_status = 'ready' LIMIT 1", [song_id])
    root = Path(__file__).resolve().parent.parent / ".runtime" / "accompaniment" / song_id
    root.mkdir(parents=True, exist_ok=True)
    voice = download_url(stems["vocals_url"], root / "vocals.mp3")
    guitar = download_url(rhythm["url"] if rhythm else stems["guitar_url"], root / "guitar.mp3")
    output = root / "vocals-rhythm.wav"
    report = render_accompaniment(voice, guitar, output)
    url = upload_file_sync(output, f"stems/{song_id}/vocals-rhythm.wav")
    current = db.query_one("SELECT vocals_url,guitar_url FROM stems WHERE song_id = ?", [song_id])
    if current != stems:
        raise RuntimeError("Source stems changed; not publishing stale mix")
    upsert_stem_layers(db, song_id, [{"layer_key": "vocals_rhythm", "label": "Vocals + Rhythm Guitar",
        "instrument": "guitar", "role": "accompaniment", "url": url,
        "source_model": "single-stream-mix-v1", "quality_status": "ready", "sort_order": 3}])
    print(json.dumps({"song_id": song_id, "report": report, "vocals_unchanged": True}))


if __name__ == "__main__":
    main(sys.argv[1])
