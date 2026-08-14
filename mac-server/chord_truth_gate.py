"""Independent, recording-derived verification for chord candidates.

The BTC model is allowed to propose chord labels, but it is never the source of
truth.  This module derives chroma evidence from the separated guitar and bass
audio and publishes only candidates that survive a second, deterministic test.

No web tabs, chord sheets, lyrics sites, or third-party song annotations are
read by this module.  When the recording is ambiguous, the result is withheld.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable

import librosa
import numpy as np


EVIDENCE_VERSION = "audio-chroma-v1"
VERIFICATION_METHOD = "btc-candidate+isolated-guitar-chroma+bass-contradiction"

SAMPLE_RATE = 22_050
HOP_LENGTH = 2_048
MIN_DURATION_SECONDS = 0.75
MIN_CANDIDATE_CONFIDENCE = 0.70
MIN_ACOUSTIC_SCORE = 0.62
MIN_SCORE_MARGIN = 0.02
MIN_FRAME_STABILITY = 0.50

_ROOT_TO_PITCH_CLASS = {
    "C": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11,
}

_QUALITY_INTERVALS = {
    "": (0, 4, 7),
    "m": (0, 3, 7),
    "dim": (0, 3, 6),
    "aug": (0, 4, 8),
    "m6": (0, 3, 7, 9),
    "6": (0, 4, 7, 9),
    "m7": (0, 3, 7, 10),
    "mM7": (0, 3, 7, 11),
    "maj7": (0, 4, 7, 11),
    "7": (0, 4, 7, 10),
    "dim7": (0, 3, 6, 9),
    "m7b5": (0, 3, 6, 10),
    "sus2": (0, 2, 7),
    "sus4": (0, 5, 7),
}

_QUALITY_WEIGHTS = {
    0: 1.0,
    2: 0.85,
    3: 0.9,
    4: 0.9,
    5: 0.85,
    6: 0.72,
    7: 0.78,
    8: 0.72,
    9: 0.68,
    10: 0.68,
    11: 0.68,
}

_CHORD_RE = re.compile(r"^([A-G](?:#|b)?)(.*)$")

_CORE_QUALITY = {
    "": "",
    "6": "",
    "7": "",
    "maj7": "",
    "m": "m",
    "m6": "m",
    "m7": "m",
    "mM7": "m",
    "dim": "dim",
    "dim7": "dim",
    "aug": "aug",
    "sus2": "sus2",
    "sus4": "sus4",
}


@dataclass(frozen=True)
class ChordTemplate:
    label: str
    root: int
    tones: tuple[int, ...]
    vector: np.ndarray


@dataclass(frozen=True)
class AudioEvidence:
    chroma: np.ndarray
    rms: np.ndarray
    frames_per_second: float
    energy_floor: float


def _template_vector(root: int, intervals: Iterable[int]) -> tuple[np.ndarray, tuple[int, ...]]:
    vector = np.zeros(12, dtype=np.float64)
    tones: list[int] = []
    for interval in intervals:
        pitch_class = (root + interval) % 12
        tones.append(pitch_class)
        vector[pitch_class] = _QUALITY_WEIGHTS[interval]
    norm = np.linalg.norm(vector)
    if norm:
        vector /= norm
    return vector, tuple(tones)


def parse_chord(label: str) -> ChordTemplate | None:
    """Parse one compact concert-pitch chord such as ``F#m7``."""
    match = _CHORD_RE.match(label.strip())
    if not match:
        return None
    root_name, quality = match.groups()
    root = _ROOT_TO_PITCH_CLASS.get(root_name)
    intervals = _QUALITY_INTERVALS.get(quality)
    if root is None or intervals is None:
        return None
    vector, tones = _template_vector(root, intervals)
    return ChordTemplate(label=label.strip(), root=root, tones=tones, vector=vector)


def _all_templates() -> list[ChordTemplate]:
    templates: list[ChordTemplate] = []
    canonical_roots = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
    for root_name in canonical_roots:
        root = _ROOT_TO_PITCH_CLASS[root_name]
        for quality, intervals in _QUALITY_INTERVALS.items():
            vector, tones = _template_vector(root, intervals)
            templates.append(
                ChordTemplate(
                    label=f"{root_name}{quality}",
                    root=root,
                    tones=tones,
                    vector=vector,
                )
            )
    return templates


_TEMPLATES = _all_templates()
_CORE_TEMPLATES = [
    template
    for template in _TEMPLATES
    if any(
        template.label.endswith(quality)
        for quality in ("dim", "aug", "sus2", "sus4")
    )
    or not any(marker in template.label for marker in ("6", "7"))
]


def core_chord(label: str) -> ChordTemplate | None:
    """Return the harmony the audio can safely prove without guessing extensions."""
    match = _CHORD_RE.match(label.strip())
    if not match:
        return None
    root_name, quality = match.groups()
    core_quality = _CORE_QUALITY.get(quality)
    if core_quality is None:
        return None
    return parse_chord(f"{root_name}{core_quality}")


def _normalize_chroma(chroma: np.ndarray) -> np.ndarray:
    values = np.maximum(np.asarray(chroma, dtype=np.float64), 0)
    total = float(values.sum())
    if total <= 1e-12:
        return np.zeros(12, dtype=np.float64)
    return values / total


def score_template(chroma: np.ndarray, template: ChordTemplate) -> float:
    """Score chord-tone support and spectral shape on a 0..1 scale."""
    normalized = _normalize_chroma(chroma)
    support = float(normalized[list(template.tones)].sum())
    norm = float(np.linalg.norm(normalized))
    cosine = float(np.dot(normalized, template.vector) / norm) if norm else 0.0
    return float(np.clip(0.55 * support + 0.45 * cosine, 0.0, 1.0))


def _same_harmony(left: ChordTemplate, right: ChordTemplate) -> bool:
    return left.root == right.root and set(left.tones) == set(right.tones)


def assess_chroma(
    candidate_label: str,
    aggregate_chroma: np.ndarray,
    window_chromas: Iterable[np.ndarray],
) -> dict:
    """Assess precomputed chroma; separated for deterministic unit tests."""
    candidate = core_chord(candidate_label)
    if candidate is None:
        return {
            "passed": False,
            "reason": "unsupported_chord_label",
            "acoustic_score": 0.0,
            "score_margin": 0.0,
            "frame_stability": 0.0,
        }

    ranked = sorted(
        (
            (score_template(aggregate_chroma, template), template)
            for template in _CORE_TEMPLATES
        ),
        key=lambda item: item[0],
        reverse=True,
    )
    candidate_score = score_template(aggregate_chroma, candidate)
    best_score, best_template = ranked[0]
    runner_up = max(
        score
        for score, template in ranked
        if not _same_harmony(candidate, template)
    )
    margin = candidate_score - runner_up

    windows = list(window_chromas)
    stable = 0
    for window in windows:
        window_candidate_score = score_template(window, candidate)
        window_best_score = max(
            score_template(window, template) for template in _CORE_TEMPLATES
        )
        if (
            window_candidate_score >= MIN_ACOUSTIC_SCORE - 0.06
            and window_candidate_score >= window_best_score - 0.035
        ):
            stable += 1
    stability = stable / len(windows) if windows else 0.0

    passed = (
        _same_harmony(candidate, best_template)
        and candidate_score >= MIN_ACOUSTIC_SCORE
        and margin >= MIN_SCORE_MARGIN
        and stability >= MIN_FRAME_STABILITY
    )
    if not _same_harmony(candidate, best_template):
        reason = "guitar_supports_different_harmony"
    elif candidate_score < MIN_ACOUSTIC_SCORE:
        reason = "weak_guitar_support"
    elif margin < MIN_SCORE_MARGIN:
        reason = "ambiguous_chord_quality"
    elif stability < MIN_FRAME_STABILITY:
        reason = "unstable_guitar_support"
    else:
        reason = "verified"

    return {
        "passed": passed,
        "reason": reason,
        "acoustic_score": round(candidate_score, 4),
        "score_margin": round(margin, 4),
        "frame_stability": round(stability, 4),
        "best_harmony": best_template.label,
        "best_score": round(best_score, 4),
    }


def extract_audio_evidence(audio_path: str) -> AudioEvidence:
    y, sr = librosa.load(audio_path, sr=SAMPLE_RATE, mono=True)
    if y.size == 0:
        raise ValueError(f"No audio samples in {audio_path}")
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP_LENGTH)
    rms = librosa.feature.rms(y=y, frame_length=4_096, hop_length=HOP_LENGTH)[0]
    frame_count = min(chroma.shape[1], rms.shape[0])
    chroma = chroma[:, :frame_count]
    rms = rms[:frame_count]
    active_reference = float(np.percentile(rms, 75)) if rms.size else 0.0
    energy_floor = max(5e-4, active_reference * 0.10)
    return AudioEvidence(
        chroma=chroma,
        rms=rms,
        frames_per_second=sr / HOP_LENGTH,
        energy_floor=energy_floor,
    )


def _frame_slice(evidence: AudioEvidence, start: float, end: float) -> slice:
    start_frame = max(0, int(np.floor(start * evidence.frames_per_second)))
    end_frame = min(
        evidence.chroma.shape[1],
        max(start_frame + 1, int(np.ceil(end * evidence.frames_per_second))),
    )
    return slice(start_frame, end_frame)


def _window_chromas(chroma: np.ndarray, frames_per_second: float) -> list[np.ndarray]:
    if chroma.shape[1] == 0:
        return []
    window_frames = max(4, int(round(frames_per_second * 1.25)))
    if chroma.shape[1] <= window_frames:
        return [np.mean(chroma, axis=1)]
    hop = max(2, window_frames // 2)
    windows = [
        np.mean(chroma[:, start : start + window_frames], axis=1)
        for start in range(0, chroma.shape[1] - window_frames + 1, hop)
    ]
    if (chroma.shape[1] - window_frames) % hop:
        windows.append(np.mean(chroma[:, -window_frames:], axis=1))
    return windows


def _bass_assessment(
    candidate: ChordTemplate,
    bass: AudioEvidence | None,
    start: float,
    end: float,
) -> tuple[bool, float | None, str | None]:
    if bass is None:
        return True, None, None
    interval = _frame_slice(bass, start, end)
    interval_rms = bass.rms[interval]
    if interval_rms.size == 0 or float(np.median(interval_rms)) < bass.energy_floor:
        return True, None, None

    normalized = _normalize_chroma(np.mean(bass.chroma[:, interval], axis=1))
    peak = int(np.argmax(normalized))
    support = float(normalized[list(candidate.tones)].sum())
    strongest_chord_tone = float(normalized[list(candidate.tones)].max())
    strongest_outside_tone = float(
        normalized[[pitch for pitch in range(12) if pitch not in candidate.tones]].max()
    )

    # Bass can contain inversions and passing notes. It vetoes only when a
    # strong outside pitch dominates every chord tone; otherwise it remains
    # supporting/neutral evidence and the isolated-guitar gate decides.
    contradicts = (
        peak not in candidate.tones
        and support < 0.35
        and strongest_outside_tone > strongest_chord_tone * 1.35
    )
    return (
        not contradicts,
        round(support, 4),
        "bass_contradicts_chord" if contradicts else None,
    )


def verify_chord_candidates(
    candidates: list[dict],
    guitar_audio_path: str,
    bass_audio_path: str | None = None,
) -> list[dict]:
    """Return every candidate with a verified/withheld evidence record."""
    guitar = extract_audio_evidence(guitar_audio_path)
    bass = extract_audio_evidence(bass_audio_path) if bass_audio_path else None
    results: list[dict] = []

    for original in candidates:
        candidate = dict(original)
        start = float(candidate["start"])
        end = float(candidate["end"])
        confidence = float(candidate.get("confidence") or 0.0)
        original_standard = str(candidate.get("standard") or "")
        chord = core_chord(original_standard)

        evidence = {
            "state": "withheld",
            "reason": "not_evaluated",
            "method": VERIFICATION_METHOD,
            "evidence_version": EVIDENCE_VERSION,
            "candidate_confidence": round(confidence, 4),
            "acoustic_score": 0.0,
            "score_margin": 0.0,
            "frame_stability": 0.0,
            "bass_support": None,
        }

        if chord is None:
            evidence["reason"] = "unsupported_chord_label"
        elif end - start < MIN_DURATION_SECONDS:
            evidence["reason"] = "interval_too_short"
        elif confidence < MIN_CANDIDATE_CONFIDENCE:
            evidence["reason"] = "weak_candidate_model"
        else:
            # Trim only the uncertain transition edge, never more than 150 ms.
            trim = min(0.15, max(0.0, (end - start) * 0.08))
            interval = _frame_slice(guitar, start + trim, end - trim)
            interval_rms = guitar.rms[interval]
            interval_chroma = guitar.chroma[:, interval]
            if (
                interval_chroma.shape[1] < 4
                or interval_rms.size == 0
                or float(np.median(interval_rms)) < guitar.energy_floor
            ):
                evidence["reason"] = "insufficient_guitar_signal"
            else:
                assessment = assess_chroma(
                    original_standard,
                    np.mean(interval_chroma, axis=1),
                    _window_chromas(interval_chroma, guitar.frames_per_second),
                )
                evidence.update(
                    acoustic_score=assessment["acoustic_score"],
                    score_margin=assessment["score_margin"],
                    frame_stability=assessment["frame_stability"],
                    reason=assessment["reason"],
                )
                bass_passed, bass_support, bass_reason = _bass_assessment(
                    chord, bass, start + trim, end - trim
                )
                evidence["bass_support"] = bass_support
                if assessment["passed"] and bass_passed:
                    evidence["state"] = "verified"
                    evidence["reason"] = "verified"
                    candidate["standard"] = chord.label
                elif bass_reason:
                    evidence["reason"] = bass_reason

        candidate["verification"] = evidence
        results.append(candidate)

    return results


def verified_count(candidates: Iterable[dict]) -> int:
    return sum(
        1
        for candidate in candidates
        if candidate.get("verification", {}).get("state") == "verified"
    )
