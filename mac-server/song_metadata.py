"""Conservative song names, separate from YouTube upload marketing."""
import re


def clean_song_title(title: str, artist: str | None = None) -> tuple[str, str | None]:
    original = title.strip()
    # Work on the primary title BEFORE splitting dashes in translated titles.
    title = re.split(r"\s*[|｜]\s*", original, maxsplit=1)[0]
    title = re.sub(r"\s*[\[(](?:official\s+)?(?:audio|video|music video|lyric(?:s| video)?|cover|HD|4K)[\])]", "", title, flags=re.I)
    title = re.split(r"\s*[-–—]?\s+\b(?:4K|8K|HD|HQ)\b(?:\s|$)", title, maxsplit=1, flags=re.I)[0]
    by = re.fullmatch(r"(.+?)\s+by\s+(.+)", title, flags=re.I)
    if by:
        title, artist = by.group(1), by.group(2).strip()
    elif artist:
        # Only remove a side when it matches known artist metadata. Never
        # assume everything before a dash is an artist.
        parts = re.split(r"\s+[-–—]\s+", title, maxsplit=1)
        key = lambda value: re.sub(r"\s+", "", value).casefold()
        if len(parts) == 2:
            if key(parts[0]) == key(artist):
                title = parts[1]
            elif key(parts[1]) == key(artist):
                title = parts[0]
    title = re.sub(r"\s+", " ", title).strip(" -–—")
    return title or original or "Unknown Title", artist
