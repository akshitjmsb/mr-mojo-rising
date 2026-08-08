"""Duration-aware synchronized lyric selection from LRCLIB."""

from __future__ import annotations

import json
import re
import unicodedata
from urllib.parse import urlencode
from urllib.request import Request, urlopen

LRCLIB_SEARCH_URL = "https://lrclib.net/api/search"
USER_AGENT = "MrMojoRising/0.1 (personal guitar practice app)"
_TIMESTAMP_RE = re.compile(r"\[(\d{2}):(\d{2}(?:\.\d+)?)\]")


def _normalized(value: str | None) -> str:
    if not value:
        return ""
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return "".join(character for character in value.lower() if character.isalnum())


def last_lrc_timestamp(lrc: str) -> float | None:
    matches = _TIMESTAMP_RE.findall(lrc)
    if not matches:
        return None
    minutes, seconds = matches[-1]
    return int(minutes) * 60 + float(seconds)


def select_duration_matched_record(
    records: list[dict],
    *,
    title: str,
    artist: str | None,
    duration: float,
) -> dict | None:
    """Choose a synchronized record whose metadata and length fit the audio."""
    normalized_title = _normalized(title)
    normalized_artist = _normalized(artist)
    tolerance = max(8.0, duration * 0.03)
    candidates: list[tuple[float, int, dict]] = []

    for index, record in enumerate(records):
        synced = record.get("syncedLyrics")
        record_duration = record.get("duration")
        if not isinstance(synced, str) or not synced.strip():
            continue
        if not isinstance(record_duration, (int, float)):
            continue

        record_title = _normalized(record.get("trackName"))
        record_artist = _normalized(record.get("artistName"))
        title_matches = (
            record_title == normalized_title
            or record_title in normalized_title
            or normalized_title in record_title
        )
        artist_matches = (
            not normalized_artist
            or record_artist == normalized_artist
            or record_artist in normalized_artist
            or normalized_artist in record_artist
        )
        difference = abs(float(record_duration) - duration)
        if not title_matches or not artist_matches or difference > tolerance:
            continue

        last_timestamp = last_lrc_timestamp(synced)
        if last_timestamp is None:
            continue
        if last_timestamp > duration + 2 or last_timestamp < duration * 0.65:
            continue
        candidates.append((difference, index, record))

    if not candidates:
        return None
    return min(candidates, key=lambda item: (item[0], item[1]))[2]


def fetch_duration_matched_lyrics(
    title: str,
    artist: str | None,
    duration: float,
    *,
    timeout_seconds: int = 15,
) -> dict | None:
    params = {"track_name": title}
    if artist:
        params["artist_name"] = artist
    request = Request(
        f"{LRCLIB_SEARCH_URL}?{urlencode(params)}",
        headers={"User-Agent": USER_AGENT},
    )
    with urlopen(request, timeout=timeout_seconds) as response:
        records = json.load(response)
    if not isinstance(records, list):
        return None
    record = select_duration_matched_record(
        records,
        title=title,
        artist=artist,
        duration=duration,
    )
    if not record:
        return None
    return {
        "synced_lrc": record["syncedLyrics"],
        "plain_text": record.get("plainLyrics"),
        "source": f"lrclib/duration_matched/{record.get('id', 'unknown')}",
    }
