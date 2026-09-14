"""Render a single clock-safe listening asset without changing source stems."""
from pathlib import Path
import numpy as np
import soundfile as sf
from math import gcd
from scipy.signal import resample_poly


def render_accompaniment(vocals: Path, guitar: Path, output: Path) -> dict:
    voice, rate = sf.read(vocals, always_2d=True, dtype="float32")
    strings, guitar_rate = sf.read(guitar, always_2d=True, dtype="float32")
    if abs(len(voice) / rate - len(strings) / guitar_rate) > 0.05:
        raise ValueError("Cannot mix misaligned stems")
    if rate != guitar_rate:
        divisor = gcd(rate, guitar_rate)
        strings = resample_poly(strings, rate // divisor, guitar_rate // divisor, axis=0)
    if not voice.size or not strings.size or not np.isfinite(voice).all() or not np.isfinite(strings).all():
        raise ValueError("Invalid source audio")
    length = max(len(voice), len(strings))
    channels = max(voice.shape[1], strings.shape[1])
    def fit(audio):
        if audio.shape[1] == 1 and channels == 2:
            audio = np.repeat(audio, 2, axis=1)
        if audio.shape[1] != channels:
            raise ValueError("Incompatible channel layouts")
        return np.pad(audio, ((0, length-len(audio)), (0, 0)))
    voice, strings = fit(voice), fit(strings)
    def active_level(audio):
        levels = np.array([np.sqrt(np.mean(audio[i:i+rate] ** 2)) for i in range(0, length, rate)])
        active = levels[levels > max(1e-5, float(levels.max()) * 0.05)]
        if not len(active):
            raise ValueError("A source stem is silent")
        return float(np.median(active))
    vocal_level, guitar_level = active_level(voice), active_level(strings)
    guitar_gain = float(np.clip(vocal_level * 0.85 / guitar_level, 0.5, 4))
    mixed = voice + strings * guitar_gain
    scale = min(1.0, 0.95 / max(float(np.max(np.abs(mixed))), 1e-8))
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, mixed * scale, rate, subtype="PCM_24")
    return {"guitar_gain": guitar_gain, "master_gain": scale,
            "vocal_active_rms": vocal_level, "guitar_active_rms": guitar_level,
            "duration_seconds": length / rate, "single_stream": True}
