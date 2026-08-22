"""Align known lyric text to the app's own isolated vocal recording.

Catalog LRC timestamps are useful hints, but they often belong to a different
release of a song. This module uses MLX Whisper on Apple Silicon to recover
word timestamps from the local vocal stem, then monotonically maps the known
lyrics onto those words. Low-coverage results are rejected instead of being
presented as synchronized.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from rapidfuzz.fuzz import ratio

LINE_TIMESTAMP_RE = re.compile(r"\[(\d{1,3}):(\d{2}(?:\.\d+)?)\]\s*(.*)")
INLINE_TIMESTAMP_RE = re.compile(r"<\d{1,3}:\d{2}(?:\.\d+)?>")
WORD_RE = re.compile(r"[^\W_]+(?:['’][^\W_]+)*", re.UNICODE)

DEFAULT_MODEL = "mlx-community/whisper-large-v3-turbo"
MIN_WORD_SIMILARITY = 0.48
MIN_LINE_COVERAGE = 0.40
MIN_RESULT_WORD_COVERAGE = 0.55
MIN_RESULT_LINE_COVERAGE = 0.65


@dataclass(frozen=True)
class CatalogLine:
    time: float
    text: str


@dataclass(frozen=True)
class SourceWord:
    line_index: int
    word_index: int
    text: str
    normalized: str
    catalog_time: float
    char_start: int
    char_end: int


@dataclass(frozen=True)
class HeardWord:
    text: str
    normalized: str
    start: float
    end: float
    probability: float


@dataclass(frozen=True)
class AlignmentReport:
    matched_words: int
    total_words: int
    aligned_lines: int
    total_lines: int
    word_coverage: float
    line_coverage: float
    passed: bool


def _timestamp(seconds: float, *, brackets: str = "[]") -> str:
    value = max(0.0, float(seconds))
    minutes = int(value // 60)
    remainder = value - minutes * 60
    return f"{brackets[0]}{minutes:02d}:{remainder:06.3f}{brackets[1]}"


def _normalize(value: str) -> str:
    return "".join(character for character in value.casefold() if character.isalnum())


def _mostly_latin(value: str) -> bool:
    letters = [character for character in value if character.isalpha()]
    if not letters:
        return False
    latin = sum("LATIN" in unicodedata.name(character, "") for character in letters)
    return latin / len(letters) >= 0.85


def parse_catalog_lines(lyrics: dict[str, Any]) -> list[CatalogLine]:
    lines: list[CatalogLine] = []
    synced_lrc = lyrics.get("synced_lrc")
    if isinstance(synced_lrc, str):
        for raw_line in synced_lrc.splitlines():
            match = LINE_TIMESTAMP_RE.match(raw_line.strip())
            if not match:
                continue
            minutes, seconds, text = match.groups()
            clean_text = INLINE_TIMESTAMP_RE.sub("", text).strip()
            if clean_text:
                lines.append(
                    CatalogLine(
                        time=int(minutes) * 60 + float(seconds),
                        text=clean_text,
                    )
                )
    if lines:
        return lines

    plain_text = lyrics.get("plain_text")
    if not isinstance(plain_text, str):
        return []
    return [
        CatalogLine(time=float(index), text=line.strip())
        for index, line in enumerate(plain_text.splitlines())
        if line.strip()
    ]


def source_words(lines: list[CatalogLine]) -> list[SourceWord]:
    words: list[SourceWord] = []
    for line_index, line in enumerate(lines):
        for word_index, match in enumerate(WORD_RE.finditer(line.text)):
            normalized = _normalize(match.group())
            if normalized:
                words.append(
                    SourceWord(
                        line_index=line_index,
                        word_index=word_index,
                        text=match.group(),
                        normalized=normalized,
                        catalog_time=line.time,
                        char_start=match.start(),
                        char_end=match.end(),
                    )
                )
    return words


def heard_words(transcription: dict[str, Any]) -> list[HeardWord]:
    words: list[HeardWord] = []
    for segment in transcription.get("segments") or []:
        for item in segment.get("words") or []:
            raw_word = str(item.get("word") or "").strip()
            normalized = _normalize(raw_word)
            start = item.get("start")
            end = item.get("end")
            if not normalized or not isinstance(start, (int, float)):
                continue
            words.append(
                HeardWord(
                    text=raw_word,
                    normalized=normalized,
                    start=float(start),
                    end=float(end) if isinstance(end, (int, float)) else float(start),
                    probability=float(item.get("probability") or 0.0),
                )
            )
    return words


def align_word_sequences(
    expected: list[SourceWord],
    heard: list[HeardWord],
) -> dict[int, tuple[int, float]]:
    """Needleman-Wunsch alignment with a weak catalog-time prior.

    The temporal prior disambiguates repeated choruses without trusting the
    catalog enough to preserve its drift.
    """
    if not expected or not heard:
        return {}

    gap_penalty = -0.44
    rows = len(expected) + 1
    columns = len(heard) + 1
    scores = [[0.0] * columns for _ in range(rows)]
    trace = [[0] * columns for _ in range(rows)]  # 1 diagonal, 2 up, 3 left
    for row in range(1, rows):
        scores[row][0] = row * gap_penalty
        trace[row][0] = 2
    for column in range(1, columns):
        scores[0][column] = column * gap_penalty
        trace[0][column] = 3

    for row in range(1, rows):
        expected_word = expected[row - 1]
        for column in range(1, columns):
            heard_word = heard[column - 1]
            similarity = ratio(expected_word.normalized, heard_word.normalized) / 100.0
            lexical_score = 1.20 * similarity - 0.45
            if similarity < 0.35:
                lexical_score = -0.72
            timing_penalty = min(
                abs(expected_word.catalog_time - heard_word.start) / 480.0,
                0.22,
            )
            diagonal = scores[row - 1][column - 1] + lexical_score - timing_penalty
            up = scores[row - 1][column] + gap_penalty
            left = scores[row][column - 1] + gap_penalty
            best = max(diagonal, up, left)
            scores[row][column] = best
            trace[row][column] = 1 if best == diagonal else 2 if best == up else 3

    mapping: dict[int, tuple[int, float]] = {}
    row = len(expected)
    column = len(heard)
    while row > 0 or column > 0:
        direction = trace[row][column]
        if direction == 1:
            expected_index = row - 1
            heard_index = column - 1
            similarity = (
                ratio(
                    expected[expected_index].normalized,
                    heard[heard_index].normalized,
                )
                / 100.0
            )
            if similarity >= MIN_WORD_SIMILARITY:
                mapping[expected_index] = (heard_index, similarity)
            row -= 1
            column -= 1
        elif direction == 2:
            row -= 1
        elif direction == 3:
            column -= 1
        else:
            break
    return mapping


def _interpolate_line_times(
    words: list[SourceWord],
    mapped_times: dict[int, float],
) -> list[float]:
    anchors = sorted(mapped_times.items())
    if not anchors:
        return []
    output: list[float] = []
    for index in range(len(words)):
        if index in mapped_times:
            output.append(mapped_times[index])
            continue
        before = next((item for item in reversed(anchors) if item[0] < index), None)
        after = next((item for item in anchors if item[0] > index), None)
        if before and after:
            fraction = (index - before[0]) / (after[0] - before[0])
            output.append(before[1] + fraction * (after[1] - before[1]))
        elif before:
            output.append(before[1] + 0.32 * (index - before[0]))
        else:
            assert after is not None
            output.append(max(0.0, after[1] - 0.32 * (after[0] - index)))
    return output


def build_enhanced_lrc(
    lines: list[CatalogLine],
    expected: list[SourceWord],
    heard: list[HeardWord],
    mapping: dict[int, tuple[int, float]],
) -> tuple[str | None, AlignmentReport]:
    line_words: dict[int, list[tuple[int, SourceWord]]] = {}
    for expected_index, word in enumerate(expected):
        line_words.setdefault(word.line_index, []).append((expected_index, word))

    output_lines: list[str] = []
    matched_words = 0
    aligned_lines = 0
    for line_index, line in enumerate(lines):
        indexed_words = line_words.get(line_index, [])
        if not indexed_words:
            continue
        matched = [item for item in indexed_words if item[0] in mapping]
        coverage = len(matched) / len(indexed_words)
        if coverage < MIN_LINE_COVERAGE:
            continue

        mapped_times = {
            local_index: heard[mapping[expected_index][0]].start
            for local_index, (expected_index, _) in enumerate(indexed_words)
            if expected_index in mapping
        }
        times = _interpolate_line_times(
            [word for _, word in indexed_words],
            mapped_times,
        )
        if not times:
            continue
        enhanced_parts: list[str] = []
        cursor = 0
        for time, (_, word) in zip(times, indexed_words):
            enhanced_parts.append(line.text[cursor:word.char_start])
            enhanced_parts.append(_timestamp(time, brackets="<>"))
            enhanced_parts.append(line.text[word.char_start:word.char_end])
            cursor = word.char_end
        enhanced_parts.append(line.text[cursor:])
        enhanced_words = "".join(enhanced_parts)
        output_lines.append(f"{_timestamp(times[0])}{enhanced_words}")
        matched_words += len(matched)
        aligned_lines += 1

    total_words = len(expected)
    total_lines = len([line for line in lines if WORD_RE.search(line.text)])
    word_coverage = matched_words / total_words if total_words else 0.0
    line_coverage = aligned_lines / total_lines if total_lines else 0.0
    passed = (
        word_coverage >= MIN_RESULT_WORD_COVERAGE
        and line_coverage >= MIN_RESULT_LINE_COVERAGE
    )
    report = AlignmentReport(
        matched_words=matched_words,
        total_words=total_words,
        aligned_lines=aligned_lines,
        total_lines=total_lines,
        word_coverage=word_coverage,
        line_coverage=line_coverage,
        passed=passed,
    )
    return ("\n".join(output_lines) if passed else None), report


def align_lyrics_to_vocals(
    lyrics: dict[str, Any],
    vocal_audio_path: str | Path,
    *,
    model: str = DEFAULT_MODEL,
) -> tuple[dict[str, Any], AlignmentReport]:
    lines = parse_catalog_lines(lyrics)
    expected = source_words(lines)
    if not expected:
        report = AlignmentReport(0, 0, 0, 0, 0.0, 0.0, False)
        return lyrics, report

    import mlx_whisper

    # Keep the bias short. A long repeated-chorus prompt can make Whisper skip
    # the real opening and lock onto a later occurrence of the same refrain.
    prompt = " ".join(line.text for line in lines)[:300]
    def transcribe(language: str | None = None) -> dict[str, Any]:
        return mlx_whisper.transcribe(
            str(vocal_audio_path),
            path_or_hf_repo=model,
            word_timestamps=True,
            initial_prompt=prompt,
            condition_on_previous_text=False,
            language=language,
            verbose=False,
        )

    def build(transcription: dict[str, Any]):
        heard = heard_words(transcription)
        mapping = align_word_sequences(expected, heard)
        return build_enhanced_lrc(lines, expected, heard, mapping)

    transcription = transcribe()
    enhanced_lrc, report = build(transcription)
    detected_language = str(transcription.get("language") or "")
    if (
        not report.passed
        and detected_language not in {"", "en"}
        and _mostly_latin(" ".join(line.text for line in lines))
    ):
        romanized_lrc, romanized_report = build(transcribe("en"))
        if romanized_report.word_coverage > report.word_coverage:
            enhanced_lrc, report = romanized_lrc, romanized_report
    plain_text = "\n".join(line.text for line in lines)
    if not enhanced_lrc:
        return {
            "synced_lrc": None,
            "plain_text": plain_text,
            "source": f"{lyrics.get('source', 'unknown')}/local_alignment_withheld",
        }, report

    return {
        "synced_lrc": enhanced_lrc,
        "plain_text": plain_text,
        "source": (
            f"local-vocal-align/mlx-whisper-large-v3-turbo"
            f";words={report.word_coverage:.3f};lines={report.line_coverage:.3f}"
        ),
    }, report
