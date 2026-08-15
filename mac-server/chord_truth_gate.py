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


EVIDENCE_VERSION = "audio-sequence-v2"
VERIFICATION_METHOD = (
    "btc-candidate+isolated-guitar-chroma+bass+self-repetition"
)

SAMPLE_RATE = 22_050
HOP_LENGTH = 2_048
MIN_DURATION_SECONDS = 0.75
MIN_CANDIDATE_CONFIDENCE = 0.70
MIN_ACOUSTIC_SCORE = 0.62
MIN_SCORE_MARGIN = 0.02
MIN_FRAME_STABILITY = 0.50
MAX_CORE_MERGE_GAP_SECONDS = 0.12
MAX_ATTACK_SNAP_SECONDS = 0.18
MIN_REPETITIONS_WITHOUT_ANCHORS = 4

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
    onset_times: np.ndarray | None = None


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


def merge_core_candidates(candidates: list[dict]) -> list[dict]:
    """Merge adjacent model fragments that describe the same core harmony.

    BTC often emits ``G#`` → ``G#7`` → ``G#`` across one strum. The extension
    is not independently provable, but splitting it into sub-second rows makes
    the otherwise stable core impossible to verify. Confidence is combined by
    duration so tiny transition fragments cannot dominate the merged interval.
    """
    merged: list[dict] = []
    for original in sorted(candidates, key=lambda item: float(item["start"])):
        item = dict(original)
        chord = core_chord(str(item.get("standard") or ""))
        if chord is None:
            merged.append(item)
            continue

        item["standard"] = chord.label
        item["_confidence_weight"] = max(
            0.001, float(item["end"]) - float(item["start"])
        )
        previous = merged[-1] if merged else None
        previous_chord = (
            core_chord(str(previous.get("standard") or "")) if previous else None
        )
        gap = (
            float(item["start"]) - float(previous["end"])
            if previous is not None
            else float("inf")
        )
        if (
            previous is not None
            and previous_chord is not None
            and _same_harmony(chord, previous_chord)
            and gap <= MAX_CORE_MERGE_GAP_SECONDS
        ):
            previous_weight = float(previous.get("_confidence_weight") or 0.001)
            item_weight = float(item["_confidence_weight"])
            previous["confidence"] = round(
                (
                    float(previous.get("confidence") or 0.0) * previous_weight
                    + float(item.get("confidence") or 0.0) * item_weight
                )
                / (previous_weight + item_weight),
                4,
            )
            previous["end"] = max(float(previous["end"]), float(item["end"]))
            previous["_confidence_weight"] = previous_weight + item_weight
            continue
        merged.append(item)

    for item in merged:
        item.pop("_confidence_weight", None)
    return merged


def snap_boundaries_to_attacks(
    candidates: list[dict], onset_times: np.ndarray | None
) -> list[dict]:
    """Snap continuous model transitions to the nearest isolated-guitar attack."""
    if onset_times is None or len(onset_times) == 0 or not candidates:
        return candidates
    snapped = [dict(candidate) for candidate in candidates]
    onsets = np.asarray(onset_times, dtype=np.float64)

    for index in range(1, len(snapped)):
        previous = snapped[index - 1]
        current = snapped[index]
        if abs(float(current["start"]) - float(previous["end"])) > 0.15:
            continue
        boundary = (float(previous["end"]) + float(current["start"])) / 2
        insertion = int(np.searchsorted(onsets, boundary))
        nearby = onsets[max(0, insertion - 1) : min(len(onsets), insertion + 2)]
        if len(nearby) == 0:
            continue
        attack = float(min(nearby, key=lambda value: abs(float(value) - boundary)))
        if abs(attack - boundary) > MAX_ATTACK_SNAP_SECONDS:
            continue
        if attack - float(previous["start"]) < MIN_DURATION_SECONDS / 2:
            continue
        if float(current["end"]) - attack < MIN_DURATION_SECONDS / 2:
            continue
        previous["end"] = round(attack, 3)
        current["start"] = round(attack, 3)
    return snapped


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
    onset_envelope = librosa.onset.onset_strength(
        y=y,
        sr=sr,
        hop_length=512,
    )
    onset_times = librosa.onset.onset_detect(
        onset_envelope=onset_envelope,
        sr=sr,
        hop_length=512,
        units="time",
        backtrack=True,
    )
    return AudioEvidence(
        chroma=chroma,
        rms=rms,
        frames_per_second=sr / HOP_LENGTH,
        energy_floor=energy_floor,
        onset_times=onset_times,
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


def _same_label_harmony(left: str, right: str | None) -> bool:
    if right is None:
        return False
    left_chord = core_chord(left)
    right_chord = core_chord(right)
    return bool(
        left_chord
        and right_chord
        and _same_harmony(left_chord, right_chord)
    )


def verify_candidates_with_evidence(
    candidates: list[dict],
    guitar: AudioEvidence,
    bass: AudioEvidence | None = None,
) -> list[dict]:
    """Verify a complete song as anchored, self-repeating harmonic sequence."""
    prepared = merge_core_candidates(candidates)
    prepared = snap_boundaries_to_attacks(prepared, guitar.onset_times)
    results: list[dict] = []

    for original in prepared:
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
        else:
            # Trim only the uncertain transition edge, never more than 150 ms.
            trim = min(0.15, max(0.0, (end - start) * 0.08))
            interval = _frame_slice(guitar, start + trim, end - trim)
            interval_rms = guitar.rms[interval]
            interval_chroma = guitar.chroma[:, interval]
            has_signal = not (
                interval_chroma.shape[1] < 4
                or interval_rms.size == 0
                or float(np.median(interval_rms)) < guitar.energy_floor
            )
            assessment = None
            if not has_signal:
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
            if confidence < MIN_CANDIDATE_CONFIDENCE:
                evidence["reason"] = "weak_candidate_model"
            elif assessment and assessment["passed"] and bass_passed:
                evidence["state"] = "verified"
                evidence["reason"] = "verified_anchor"
                candidate["standard"] = chord.label
            elif bass_reason:
                evidence["reason"] = bass_reason

            candidate["_interval_chroma"] = interval_chroma
            candidate["_best_harmony"] = (
                assessment.get("best_harmony") if assessment else None
            )
            candidate["_bass_passed"] = bass_passed

        candidate["verification"] = evidence
        results.append(candidate)

    # The recording teaches itself: strong intervals anchor a chord family,
    # while pooled repetitions decide whether weaker occurrences are the same
    # harmony. This restores continuity without consulting a song database.
    groups: dict[str, list[dict]] = {}
    for candidate in results:
        chord = core_chord(str(candidate.get("standard") or ""))
        interval_chroma = candidate.get("_interval_chroma")
        if chord is None or not isinstance(interval_chroma, np.ndarray):
            continue
        if interval_chroma.shape[1] < 4:
            continue
        groups.setdefault(chord.label, []).append(candidate)

    consensus_labels: set[str] = set()
    for label, occurrences in groups.items():
        pooled_chroma = np.concatenate(
            [candidate["_interval_chroma"] for candidate in occurrences],
            axis=1,
        )
        pooled = assess_chroma(
            label,
            np.mean(pooled_chroma, axis=1),
            _window_chromas(pooled_chroma, guitar.frames_per_second),
        )
        anchor_count = sum(
            candidate["verification"]["state"] == "verified"
            for candidate in occurrences
        )
        average_confidence = float(
            np.mean([float(candidate.get("confidence") or 0.0) for candidate in occurrences])
        )
        bass_neutral_ratio = float(
            np.mean([bool(candidate.get("_bass_passed", True)) for candidate in occurrences])
        )
        same_best_harmony = _same_label_harmony(label, pooled.get("best_harmony"))
        anchored_consensus = (
            anchor_count >= 2
            and same_best_harmony
            and pooled["acoustic_score"] >= 0.60
            and pooled["score_margin"] >= -0.01
            and pooled["frame_stability"] >= 0.50
        )
        repetition_consensus = (
            anchor_count == 0
            and len(occurrences) >= MIN_REPETITIONS_WITHOUT_ANCHORS
            and same_best_harmony
            and pooled["acoustic_score"] >= 0.60
            and pooled["score_margin"] >= 0.0
            and pooled["frame_stability"] >= 0.60
            and average_confidence >= 0.55
            and bass_neutral_ratio >= 0.75
        )
        if anchored_consensus or repetition_consensus:
            consensus_labels.add(label)

    for candidate in results:
        evidence = candidate["verification"]
        chord = core_chord(str(candidate.get("standard") or ""))
        if (
            evidence["state"] == "verified"
            or chord is None
            or chord.label not in consensus_labels
            or not candidate.get("_bass_passed", True)
        ):
            continue
        duration = float(candidate["end"]) - float(candidate["start"])
        confidence = float(candidate.get("confidence") or 0.0)
        local_support = (
            evidence["acoustic_score"] >= 0.54
            and evidence["score_margin"] >= -0.08
            and evidence["frame_stability"] >= 0.15
        )
        repeated_low_signal = (
            evidence["reason"] == "insufficient_guitar_signal"
            and confidence >= 0.78
            and duration >= 1.25
        )
        if (
            duration >= 0.50
            and confidence >= 0.50
            and (local_support or repeated_low_signal)
        ):
            evidence["state"] = "verified"
            evidence["reason"] = "verified_repetition"
            candidate["standard"] = chord.label

    for candidate in results:
        candidate.pop("_interval_chroma", None)
        candidate.pop("_best_harmony", None)
        candidate.pop("_bass_passed", None)
    return results


def verify_chord_candidates(
    candidates: list[dict],
    guitar_audio_path: str,
    bass_audio_path: str | None = None,
) -> list[dict]:
    """Extract stem evidence once, then verify the full chord sequence."""
    guitar = extract_audio_evidence(guitar_audio_path)
    bass = extract_audio_evidence(bass_audio_path) if bass_audio_path else None
    return verify_candidates_with_evidence(candidates, guitar, bass)


def verified_count(candidates: Iterable[dict]) -> int:
    return sum(
        1
        for candidate in candidates
        if candidate.get("verification", {}).get("state") == "verified"
    )


def verified_coverage(candidates: Iterable[dict]) -> float:
    """Fraction of the candidate timeline backed by published evidence."""
    rows = list(candidates)
    total = sum(
        max(0.0, float(candidate["end"]) - float(candidate["start"]))
        for candidate in rows
    )
    if total <= 0:
        return 0.0
    verified = sum(
        max(0.0, float(candidate["end"]) - float(candidate["start"]))
        for candidate in rows
        if candidate.get("verification", {}).get("state") == "verified"
    )
    return round(verified / total, 4)
