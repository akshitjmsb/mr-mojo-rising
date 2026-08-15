"""Quality-first guitar stem combination and learner-facing focus mixes."""

from __future__ import annotations

from math import gcd
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly


def _aligned_audio(*paths: Path) -> tuple[list[np.ndarray], int]:
    audio: list[np.ndarray] = []
    sample_rate: int | None = None
    for path in paths:
        samples, current_rate = sf.read(path, always_2d=True, dtype="float32")
        if sample_rate is None:
            sample_rate = current_rate
        elif current_rate != sample_rate:
            common = gcd(current_rate, sample_rate)
            samples = resample_poly(
                samples,
                sample_rate // common,
                current_rate // common,
                axis=0,
            ).astype(np.float32)
        audio.append(samples)

    if sample_rate is None or not audio:
        raise ValueError("no guitar sources")
    length = min(len(samples) for samples in audio)
    channels = min(samples.shape[1] for samples in audio)
    if length == 0 or channels == 0:
        raise ValueError("empty guitar source")
    return [samples[:length, :channels] for samples in audio], sample_rate


def _frame_rms(samples: np.ndarray, frame_size: int) -> np.ndarray:
    values = []
    for start in range(0, len(samples), frame_size):
        frame = samples[start : start + frame_size]
        values.append(float(np.sqrt(np.mean(frame**2) + 1e-12)))
    return np.asarray(values, dtype=np.float32)


def combine_guitar_candidates(
    primary_path: Path,
    coverage_path: Path,
    output_path: Path,
) -> dict[str, float | int]:
    """Keep the six-stem guitar, filling only phrases it clearly dropped.

    The primary six-stem model has the strongest context for rejecting vocals,
    drums, piano, and bass. The dedicated guitar model is deliberately used as
    a coverage safety net rather than another destructive cascade.
    """
    (primary, coverage), sample_rate = _aligned_audio(primary_path, coverage_path)
    frame_size = max(1, sample_rate)
    primary_energy = _frame_rms(primary, frame_size)
    coverage_energy = _frame_rms(coverage, frame_size)
    audible = np.concatenate(
        [primary_energy[primary_energy > 1e-5], coverage_energy[coverage_energy > 1e-5]]
    )
    floor = float(np.percentile(audible, 20) * 0.3) if audible.size else 1e-4
    floor = max(1e-4, floor)

    missing = (coverage_energy > floor) & (primary_energy < coverage_energy * 0.42)
    if len(missing) >= 3:
        frame_weights = np.convolve(
            missing.astype(np.float32),
            np.asarray([0.15, 0.7, 0.15], dtype=np.float32),
            mode="same",
        )
    else:
        frame_weights = missing.astype(np.float32)
    frame_centers = (
        np.arange(len(frame_weights), dtype=np.float32) + 0.5
    ) * frame_size
    sample_weights = np.interp(
        np.arange(len(primary), dtype=np.float32),
        frame_centers,
        frame_weights,
        left=float(frame_weights[0]),
        right=float(frame_weights[-1]),
    )[:, None]
    sample_weights = np.clip(sample_weights, 0.0, 1.0)
    combined = primary * (1.0 - sample_weights) + coverage * sample_weights

    peak = float(np.max(np.abs(combined)))
    if peak > 0.99:
        combined *= 0.99 / peak
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output_path, combined, sample_rate, subtype="PCM_24")

    log_primary = np.log10(np.maximum(primary_energy, 1e-7))
    log_coverage = np.log10(np.maximum(coverage_energy, 1e-7))
    if len(log_primary) > 1 and np.std(log_primary) > 0 and np.std(log_coverage) > 0:
        agreement = float(np.corrcoef(log_primary, log_coverage)[0, 1])
    else:
        agreement = 0.0
    return {
        "fallback_windows": int(missing.sum()),
        "primary_coverage": round(float(np.mean(primary_energy > floor)), 4),
        "coverage_model_coverage": round(float(np.mean(coverage_energy > floor)), 4),
        "energy_agreement": round(agreement, 4),
    }


def build_guitar_focus_mix(
    original_path: Path,
    isolated_path: Path,
    output_path: Path,
    *,
    background_gain: float = 0.24,
) -> None:
    """Blend the original quietly under guitar to mask separation artifacts."""
    if not 0.0 <= background_gain <= 1.0:
        raise ValueError("background_gain must be between zero and one")
    (original, isolated), sample_rate = _aligned_audio(original_path, isolated_path)
    focus = original * background_gain + isolated * (1.0 - background_gain)
    peak = float(np.max(np.abs(focus)))
    if peak > 0.99:
        focus *= 0.99 / peak
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output_path, focus, sample_rate, subtype="PCM_24")
