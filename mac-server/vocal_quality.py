"""Technical validation, not a claim of perceptual studio quality."""
from pathlib import Path
import shutil
import numpy as np
import soundfile as sf


def publish_clean_vocal(candidate: Path, reference: Path, output: Path) -> dict:
    clean, rate = sf.read(candidate, always_2d=True, dtype="float32")
    original = sf.info(reference)
    if rate != original.samplerate or clean.shape[1] != original.channels:
        raise ValueError("Vocal candidate has a different audio format")
    if abs(len(clean) - original.frames) > rate * 0.05:
        raise ValueError("Vocal candidate is truncated or misaligned")
    if not clean.size or not np.isfinite(clean).all():
        raise ValueError("Vocal candidate is empty or non-finite")
    if float(np.max(np.abs(clean))) > 1:
        raise ValueError("Vocal candidate is clipping")
    if float(np.max(np.abs(clean))) < 1e-5:
        raise ValueError("Vocal candidate is silent")
    # Crucially, don't put broader separation back into quiet sections.
    # Energy cannot distinguish absent singing from successfully removed music.
    if candidate.resolve() != output.resolve():
        shutil.copyfile(candidate, output)
    return {"blended": False, "duration_seconds": len(clean) / rate,
            "validation": "technical_only"}
