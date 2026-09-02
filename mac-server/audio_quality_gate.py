"""Fast, explainable quality checks for the four user-facing song layers.

The gate never deletes audio. A layer either passes as ``ready`` or remains
playable as ``best_available`` with a concrete reason. All checks operate on
the rendered artifacts, so encoding, alignment, and separation mistakes are
measured rather than inferred from pipeline success.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from math import gcd
from pathlib import Path
from typing import Literal

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly


EVIDENCE_VERSION = "four-layer-audio-gate-v1"
LayerKind = Literal["full", "vocals", "guitars", "rhythm", "lead"]


@dataclass(frozen=True)
class AudioFacts:
    duration_seconds: float
    rms_dbfs: float
    active_ratio: float
    peak: float
    clipped_ratio: float


@dataclass(frozen=True)
class QualityCheck:
    key: str
    passed: bool
    value: float
    limit: float
    detail: str


def inspect_audio(path: Path) -> AudioFacts:
    """Collect health metrics in bounded memory, one second at a time."""
    peak = 0.0
    energy = 0.0
    sample_count = 0
    clipped_count = 0
    active_frames = 0
    frame_count = 0

    with sf.SoundFile(path) as source:
        if source.frames <= 0 or source.samplerate <= 0 or source.channels <= 0:
            raise ValueError(f"invalid audio file: {path}")
        for samples in source.blocks(
            blocksize=source.samplerate,
            dtype="float32",
            always_2d=True,
        ):
            if not np.all(np.isfinite(samples)):
                raise ValueError(f"non-finite samples in {path}")
            mono = np.mean(samples, axis=1)
            frame_rms = float(np.sqrt(np.mean(mono**2) + 1e-12))
            active_frames += int(frame_rms >= 10 ** (-52.0 / 20.0))
            frame_count += 1
            peak = max(peak, float(np.max(np.abs(samples))))
            energy += float(np.sum(samples**2))
            sample_count += samples.size
            clipped_count += int(np.sum(np.abs(samples) >= 0.999))

        rms = float(np.sqrt(energy / max(1, sample_count)))
        return AudioFacts(
            duration_seconds=round(source.frames / source.samplerate, 4),
            rms_dbfs=round(float(20.0 * np.log10(max(rms, 1e-12))), 4),
            active_ratio=round(active_frames / max(1, frame_count), 4),
            peak=round(peak, 6),
            clipped_ratio=round(clipped_count / max(1, sample_count), 8),
        )


def _resampled_mono_blocks(path: Path, target_rate: int = 8000):
    """Yield ten-second mono blocks on one comparison clock."""
    with sf.SoundFile(path) as source:
        block_size = source.samplerate * 10
        common = gcd(source.samplerate, target_rate)
        up = target_rate // common
        down = source.samplerate // common
        for samples in source.blocks(
            blocksize=block_size,
            dtype="float32",
            always_2d=True,
        ):
            mono = np.mean(samples, axis=1)
            if source.samplerate != target_rate:
                mono = resample_poly(mono, up, down).astype(np.float32)
            yield mono


def waveform_similarity(first_path: Path, second_path: Path) -> float:
    """Measure coherent shared audio without holding a whole song in memory."""
    dot = 0.0
    first_energy = 0.0
    second_energy = 0.0
    for first_mono, second_mono in zip(
        _resampled_mono_blocks(first_path),
        _resampled_mono_blocks(second_path),
    ):
        length = min(len(first_mono), len(second_mono))
        first_mono = first_mono[:length]
        second_mono = second_mono[:length]
        first_mono -= np.mean(first_mono)
        second_mono -= np.mean(second_mono)
        dot += float(first_mono @ second_mono)
        first_energy += float(first_mono @ first_mono)
        second_energy += float(second_mono @ second_mono)
    if first_energy <= 1e-12 or second_energy <= 1e-12:
        return 0.0
    return round(abs(dot) / np.sqrt(first_energy * second_energy), 6)


def difference_energy_ratio(first_path: Path, second_path: Path) -> float:
    """Return how much two aligned role renders materially differ."""
    difference_energy = 0.0
    first_energy = 0.0
    second_energy = 0.0
    for first_block, second_block in zip(
        _resampled_mono_blocks(first_path),
        _resampled_mono_blocks(second_path),
    ):
        length = min(len(first_block), len(second_block))
        first_block = first_block[:length]
        second_block = second_block[:length]
        difference_energy += float(np.sum((first_block - second_block) ** 2))
        first_energy += float(np.sum(first_block**2))
        second_energy += float(np.sum(second_block**2))
    average_energy = (first_energy + second_energy) / 2.0
    return round(difference_energy / max(average_energy, 1e-12), 6)


def _check(
    key: str,
    passed: bool,
    value: float,
    limit: float,
    detail: str,
) -> QualityCheck:
    return QualityCheck(key, bool(passed), round(float(value), 6), limit, detail)


def evaluate_layer(
    kind: LayerKind,
    path: Path,
    *,
    reference_path: Path,
    vocals_path: Path | None = None,
    role_peer_path: Path | None = None,
) -> dict:
    """Evaluate one rendered layer and return a serializable evidence report."""
    facts = inspect_audio(path)
    reference = inspect_audio(reference_path)
    duration_tolerance = max(0.25, reference.duration_seconds * 0.0015)
    duration_delta = abs(facts.duration_seconds - reference.duration_seconds)
    minimum_active = 0.01 if kind == "vocals" else 0.02

    checks = [
        _check(
            "duration_sync",
            duration_delta <= duration_tolerance,
            duration_delta,
            round(duration_tolerance, 6),
            "Track length matches the source",
        ),
        _check(
            "signal_present",
            facts.rms_dbfs >= -55.0 and facts.active_ratio >= minimum_active,
            facts.active_ratio,
            minimum_active,
            "Audible signal is present",
        ),
        _check(
            "no_clipping",
            facts.clipped_ratio <= 0.001,
            facts.clipped_ratio,
            0.001,
            "No material hard clipping",
        ),
    ]

    if kind in {"guitars", "rhythm", "lead"} and vocals_path:
        vocal_similarity = waveform_similarity(path, vocals_path)
        checks.append(
            _check(
                "vocal_leakage",
                vocal_similarity <= 0.08,
                vocal_similarity,
                0.08,
                "Vocal leakage stays below the limit",
            )
        )

    if kind in {"rhythm", "lead"} and role_peer_path:
        role_similarity = waveform_similarity(path, role_peer_path)
        difference_ratio = difference_energy_ratio(path, role_peer_path)
        checks.append(
            _check(
                "role_separation",
                role_similarity <= 0.97 and difference_ratio >= 0.05,
                difference_ratio,
                0.05,
                "Lead and rhythm are materially different",
            )
        )

    passed_count = sum(check.passed for check in checks)
    passed = passed_count == len(checks)
    failed_keys = [check.key for check in checks if not check.passed]
    reason_by_key = {
        "duration_sync": "Track timing does not match the full song",
        "signal_present": "This layer has too little audible signal",
        "no_clipping": "Clipping was detected in this layer",
        "vocal_leakage": "Vocals may be audible in this guitar layer",
        "role_separation": "Lead and rhythm are not clearly separated",
    }
    summary = (
        f"Passed all {len(checks)} audio checks"
        if passed
        else reason_by_key[failed_keys[0]]
    )
    return {
        "status": "ready" if passed else "best_available",
        "score": round(100.0 * passed_count / max(1, len(checks)), 1),
        "summary": summary,
        "evidence_version": EVIDENCE_VERSION,
        "facts": asdict(facts),
        "checks": [asdict(check) for check in checks],
    }


def evaluate_four_layers(paths: dict[str, Path]) -> dict[str, dict]:
    """Evaluate every available user-facing layer against one source clock."""
    full_path = paths["full"]
    vocals_path = paths.get("vocals")
    reports: dict[str, dict] = {}
    for kind in ("full", "vocals", "guitars", "rhythm", "lead"):
        path = paths.get(kind)
        if not path:
            continue
        peer = None
        if kind == "lead":
            peer = paths.get("rhythm")
        elif kind == "rhythm":
            peer = paths.get("lead")
        reports[kind] = evaluate_layer(
            kind,  # type: ignore[arg-type]
            path,
            reference_path=full_path,
            vocals_path=vocals_path,
            role_peer_path=peer,
        )
    return reports
