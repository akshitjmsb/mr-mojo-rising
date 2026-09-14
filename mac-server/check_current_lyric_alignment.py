"""Prepare an alignment candidate without mutating the library or audio."""
import json
from dataclasses import asdict
from pathlib import Path
import requests
from lyrics_align import align_lyrics_to_vocals

root = Path(__file__).resolve().parent.parent / ".runtime" / "lyric-review"
root.mkdir(parents=True, exist_ok=True)
response = requests.get("https://lrclib.net/api/get/6013627", timeout=20)
response.raise_for_status()
record = response.json()
if record["artistName"] != "Silk Route":
    raise ValueError("Unexpected lyric source")
vocals = root.parent / "accompaniment" / "6de35955-99fa-467a-8a96-0cdfb501cba9" / "vocals.mp3"
candidate, report = align_lyrics_to_vocals({
    "synced_lrc": record["syncedLyrics"], "plain_text": record["plainLyrics"],
    "source": "lrclib/6013627",
}, vocals)
(root / "candidate.json").write_text(json.dumps({"lyrics": candidate, "report": asdict(report)}, ensure_ascii=False))
print(json.dumps(asdict(report)), flush=True)
