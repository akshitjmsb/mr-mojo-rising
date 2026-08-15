"""Confidence-gated lead/rhythm roles inside an isolated guitar stem."""

from __future__ import annotations

import tempfile
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter


ONSET_CLUSTER_SECONDS = 0.055
ROLE_MASK_VERSION = "note-guided-role-mask-v1"


def _onset_clusters(notes: list[dict]) -> list[list[dict]]:
    ordered = sorted(notes, key=lambda note: (note["start"], note["pitch"]))
    clusters: list[list[dict]] = []
    index = 0
    while index < len(ordered):
        cluster = [ordered[index]]
        cursor = index + 1
        while (
            cursor < len(ordered)
            and ordered[cursor]["start"] - ordered[index]["start"]
            <= ONSET_CLUSTER_SECONDS
        ):
            cluster.append(ordered[cursor])
            cursor += 1
        clusters.append(cluster)
        index = cursor
    return clusters


def _melody_candidate(cluster: list[dict]) -> dict:
    return max(
        cluster,
        key=lambda note: (
            note["pitch"],
            note.get("confidence", 0.0),
            note.get("duration", 0.0),
        ),
    )


def _continuity_score(
    candidates: list[dict],
    index: int,
) -> float:
    current = candidates[index]
    scores: list[float] = []
    for other_index in (index - 1, index + 1):
        if not 0 <= other_index < len(candidates):
            continue
        other = candidates[other_index]
        gap = abs(float(other["start"]) - float(current["start"]))
        interval = abs(int(other["pitch"]) - int(current["pitch"]))
        time_score = max(0.0, 1.0 - gap / 1.25)
        interval_score = max(0.0, 1.0 - interval / 15.0)
        scores.append(time_score * interval_score)
    return max(scores, default=0.0)


def _union_duration(intervals: list[tuple[float, float]]) -> float:
    if not intervals:
        return 0.0
    merged: list[list[float]] = []
    for start, end in sorted(intervals):
        if not merged or start > merged[-1][1]:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return sum(end - start for start, end in merged)


def classify_guitar_roles(
    notes: list[dict],
    duration_seconds: float,
) -> tuple[list[dict], dict[str, float | int | bool]]:
    """Annotate a conservative melodic lead line; everything else is rhythm.

    A generic guitar stem contains both roles. Lead evidence therefore needs a
    sparse onset, upper-register support, pitch continuity, and a confident
    transcription. Chord stacks never become a whole lead line simply because
    their top note is high.
    """
    clusters = _onset_clusters(notes)
    if not clusters or duration_seconds <= 0:
        return [], {
            "passed": False,
            "lead_note_count": 0,
            "rhythm_note_count": len(notes),
            "lead_time_coverage": 0.0,
            "pitch_threshold": 0.0,
            "median_lead_confidence": 0.0,
        }

    candidates = [_melody_candidate(cluster) for cluster in clusters]
    candidate_pitches = np.asarray(
        [candidate["pitch"] for candidate in candidates], dtype=np.float32
    )
    pitch_threshold = float(
        np.clip(np.percentile(candidate_pitches, 60), 55.0, 62.0)
    )
    lead_ids: set[int] = set()
    role_confidence: dict[int, float] = {}

    for index, (cluster, candidate) in enumerate(zip(clusters, candidates)):
        cluster_size = len(cluster)
        sparse_score = 1.0 if cluster_size == 1 else 0.58 if cluster_size == 2 else 0.0
        pitch_score = float(
            np.clip((float(candidate["pitch"]) - pitch_threshold + 5.0) / 10.0, 0.0, 1.0)
        )
        transcription_score = float(
            np.clip(candidate.get("confidence", 0.65), 0.0, 1.0)
        )
        continuity = _continuity_score(candidates, index)
        confidence = (
            sparse_score * 0.45
            + pitch_score * 0.25
            + transcription_score * 0.15
            + continuity * 0.15
        )
        if cluster_size <= 2 and confidence >= 0.66:
            lead_ids.add(id(candidate))
            role_confidence[id(candidate)] = confidence

    annotated: list[dict] = []
    lead_intervals: list[tuple[float, float]] = []
    lead_confidences: list[float] = []
    for note in sorted(notes, key=lambda item: (item["start"], item["pitch"])):
        is_lead = id(note) in lead_ids
        confidence = role_confidence.get(id(note), 1.0 if not is_lead else 0.0)
        role = "lead" if is_lead else "rhythm"
        annotated_note = {
            **note,
            "role": role,
            "role_confidence": round(float(confidence), 3),
        }
        annotated.append(annotated_note)
        if is_lead:
            start = float(note["start"])
            audible_duration = float(np.clip(note.get("duration", 0.2), 0.12, 1.2))
            lead_intervals.append((start, min(duration_seconds, start + audible_duration)))
            lead_confidences.append(confidence)

    lead_count = len(lead_intervals)
    rhythm_count = len(annotated) - lead_count
    lead_coverage = _union_duration(lead_intervals) / duration_seconds
    median_confidence = float(np.median(lead_confidences)) if lead_confidences else 0.0
    passed = (
        lead_count >= 12
        and rhythm_count >= 12
        and 0.01 <= lead_coverage <= 0.65
        and median_confidence >= 0.6
    )
    if not passed:
        annotated = [
            {**note, "role": "unknown", "role_confidence": 0.0}
            for note in annotated
        ]

    return annotated, {
        "passed": passed,
        "lead_note_count": lead_count,
        "rhythm_note_count": rhythm_count,
        "lead_time_coverage": round(lead_coverage, 4),
        "pitch_threshold": round(pitch_threshold, 2),
        "median_lead_confidence": round(median_confidence, 4),
    }


def _frequency_mask(
    frequencies: np.ndarray,
    frame_times: np.ndarray,
    lead_notes: list[dict],
) -> np.ndarray:
    mask = np.zeros((len(frequencies), len(frame_times)), dtype=np.float32)
    if not lead_notes:
        return mask

    for index, note in enumerate(lead_notes):
        start = float(note["start"])
        next_start = (
            float(lead_notes[index + 1]["start"])
            if index + 1 < len(lead_notes)
            else start + 0.8
        )
        duration = float(np.clip(note.get("duration", 0.2), 0.14, 1.2))
        end = min(start + max(duration, min(0.55, next_start - start)), start + 1.2)
        active = np.flatnonzero((frame_times >= start - 0.05) & (frame_times <= end + 0.1))
        if active.size == 0:
            continue

        fundamental = float(librosa.midi_to_hz(float(note["pitch"])))
        strength = float(np.clip(note.get("role_confidence", 0.65), 0.55, 1.0))
        for harmonic in range(1, 13):
            center = fundamental * harmonic
            if center >= frequencies[-1]:
                break
            bandwidth = max(28.0, center * 0.028)
            low = int(np.searchsorted(frequencies, center - bandwidth))
            high = int(np.searchsorted(frequencies, center + bandwidth, side="right"))
            if high <= low:
                continue
            profile = np.exp(
                -0.5 * ((frequencies[low:high] - center) / (bandwidth * 0.52)) ** 2
            ).astype(np.float32)
            mask[low:high, active] = np.maximum(
                mask[low:high, active],
                profile[:, None] * strength,
            )

    return np.clip(gaussian_filter(mask, sigma=(0.8, 1.0)), 0.0, 1.0)


def _normalize_pcm24(
    source_path: Path,
    output_path: Path,
    *,
    target_rms: float,
) -> float:
    peak = 0.0
    energy = 0.0
    sample_count = 0
    with sf.SoundFile(source_path) as source:
        for block in source.blocks(blocksize=262144, dtype="float32", always_2d=True):
            peak = max(peak, float(np.max(np.abs(block))))
            energy += float(np.sum(block**2))
            sample_count += block.size
    rms = float(np.sqrt(energy / max(1, sample_count)))
    loudness_gain = float(np.clip(target_rms / max(rms, 1e-8), 0.65, 2.5))
    scale = min(loudness_gain, 0.99 / peak) if peak > 0 else 1.0

    with sf.SoundFile(source_path) as source, sf.SoundFile(
        output_path,
        mode="w",
        samplerate=source.samplerate,
        channels=source.channels,
        subtype="PCM_24",
    ) as target:
        for block in source.blocks(blocksize=262144, dtype="float32", always_2d=True):
            target.write(block * scale)
    return scale


def render_guitar_role_focus(
    guitar_path: Path,
    annotated_notes: list[dict],
    lead_output_path: Path,
    rhythm_output_path: Path,
    *,
    base_gain: float = 0.3,
    chunk_seconds: float = 20.0,
    padding_seconds: float = 1.0,
) -> dict[str, float | bool]:
    """Render complementary lead-forward and rhythm-forward practice tracks."""
    if not 0.0 <= base_gain <= 1.0:
        raise ValueError("base_gain must be between zero and one")
    lead_notes = [note for note in annotated_notes if note.get("role") == "lead"]
    if not lead_notes:
        raise ValueError("no confidence-gated lead notes")

    info = sf.info(guitar_path)
    sample_rate = info.samplerate
    channels = info.channels
    total_frames = info.frames
    core_frames = max(1, int(chunk_seconds * sample_rate))
    padding_frames = max(0, int(padding_seconds * sample_rate))
    n_fft = 4096
    hop_length = 1024
    guitar_energy = 0.0
    lead_energy = 0.0
    sample_count = 0

    lead_output_path.parent.mkdir(parents=True, exist_ok=True)
    rhythm_output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="guitar-roles-") as temp:
        temp_root = Path(temp)
        lead_float = temp_root / "lead-float.wav"
        rhythm_float = temp_root / "rhythm-float.wav"
        with sf.SoundFile(guitar_path) as source, sf.SoundFile(
            lead_float,
            mode="w",
            samplerate=sample_rate,
            channels=channels,
            subtype="FLOAT",
        ) as lead_target, sf.SoundFile(
            rhythm_float,
            mode="w",
            samplerate=sample_rate,
            channels=channels,
            subtype="FLOAT",
        ) as rhythm_target:
            for core_start in range(0, total_frames, core_frames):
                core_end = min(total_frames, core_start + core_frames)
                read_start = max(0, core_start - padding_frames)
                read_end = min(total_frames, core_end + padding_frames)
                source.seek(read_start)
                samples = source.read(
                    read_end - read_start,
                    dtype="float32",
                    always_2d=True,
                )
                channel_first = samples.T
                spectrum = librosa.stft(
                    channel_first,
                    n_fft=n_fft,
                    hop_length=hop_length,
                    center=True,
                )
                frequencies = librosa.fft_frequencies(sr=sample_rate, n_fft=n_fft)
                frame_times = (
                    librosa.frames_to_time(
                        np.arange(spectrum.shape[-1]),
                        sr=sample_rate,
                        hop_length=hop_length,
                    )
                    + read_start / sample_rate
                )
                local_notes = [
                    note
                    for note in lead_notes
                    if float(note["start"]) <= read_end / sample_rate + 1.2
                    and float(note["start"]) + float(note.get("duration", 0.2))
                    >= read_start / sample_rate - 0.2
                ]
                mask = _frequency_mask(frequencies, frame_times, local_notes)
                lead_component = librosa.istft(
                    spectrum * mask[None, :, :],
                    hop_length=hop_length,
                    length=len(samples),
                ).T.astype(np.float32)
                rhythm_component = samples - lead_component
                lead_focus = samples * base_gain + lead_component * (1.0 - base_gain)
                rhythm_focus = samples * base_gain + rhythm_component * (1.0 - base_gain)

                local_start = core_start - read_start
                local_end = local_start + (core_end - core_start)
                lead_core = lead_focus[local_start:local_end]
                rhythm_core = rhythm_focus[local_start:local_end]
                component_core = lead_component[local_start:local_end]
                source_core = samples[local_start:local_end]
                lead_target.write(lead_core)
                rhythm_target.write(rhythm_core)
                guitar_energy += float(np.sum(source_core**2))
                lead_energy += float(np.sum(component_core**2))
                sample_count += source_core.size

        target_rms = float(np.sqrt(guitar_energy / max(1, sample_count)))
        lead_gain = _normalize_pcm24(
            lead_float,
            lead_output_path,
            target_rms=target_rms,
        )
        rhythm_gain = _normalize_pcm24(
            rhythm_float,
            rhythm_output_path,
            target_rms=target_rms,
        )

    energy_ratio = lead_energy / max(guitar_energy, 1e-12)
    passed = 0.01 <= energy_ratio <= 0.72
    return {
        "passed": passed,
        "lead_energy_ratio": round(energy_ratio, 4),
        "base_gain": round(base_gain, 3),
        "lead_gain": round(lead_gain, 3),
        "rhythm_gain": round(rhythm_gain, 3),
    }
