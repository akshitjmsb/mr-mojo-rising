"""High-level BTC chord-recognition inference.

Loads the bi-directional transformer model from `weights/btc_model_large_voca.pt`
once per process and exposes `predict_chords(audio_path)` which returns merged
(start, end, label, standard, confidence) intervals.
"""

from __future__ import annotations

import threading
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from .btc_model import BTC_model
from .features import audio_file_to_features, idx2voca_chord
from .hparams import HParams


_BTC_DIR = Path(__file__).resolve().parent
_CONFIG_PATH = _BTC_DIR / "config.yaml"
_WEIGHTS_PATH = _BTC_DIR / "weights" / "btc_model_large_voca.pt"

_LARGE_VOCA_NUM_CHORDS = 170

_model_lock = threading.Lock()
_cached: dict | None = None


_QUALITY_TO_STANDARD = {
    "min": "m",
    "maj": "",
    "dim": "dim",
    "aug": "aug",
    "min6": "m6",
    "maj6": "6",
    "min7": "m7",
    "minmaj7": "mM7",
    "maj7": "maj7",
    "7": "7",
    "dim7": "dim7",
    "hdim7": "m7b5",
    "sus2": "sus2",
    "sus4": "sus4",
}


def _to_standard(label: str) -> str:
    """Convert BTC label like 'C:min7' / 'F#' / 'N' to compact 'Cm7' / 'F#' / 'N'."""
    if label in ("N", "X"):
        return label
    if ":" not in label:
        return label
    root, quality = label.split(":", 1)
    return root + _QUALITY_TO_STANDARD.get(quality, quality)


def _pick_device() -> torch.device:
    if torch.backends.mps.is_built() and torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def _load() -> dict:
    global _cached
    with _model_lock:
        if _cached is not None:
            return _cached

        if not _WEIGHTS_PATH.exists():
            raise FileNotFoundError(
                f"BTC weights not found at {_WEIGHTS_PATH}. "
                "Download btc_model_large_voca.pt from "
                "https://github.com/jayg996/BTC-ISMIR19/tree/master/test"
            )

        config = HParams.load(str(_CONFIG_PATH))
        config.feature["large_voca"] = True
        config.model["num_chords"] = _LARGE_VOCA_NUM_CHORDS

        device = _pick_device()
        model = BTC_model(config=config.model).to(device)

        checkpoint = torch.load(str(_WEIGHTS_PATH), map_location=device, weights_only=False)
        model.load_state_dict(checkpoint["model"])
        model.eval()

        _cached = {
            "config": config,
            "model": model,
            "device": device,
            "mean": float(checkpoint["mean"]),
            "std": float(checkpoint["std"]),
            "idx_to_chord": idx2voca_chord(),
        }
        return _cached


def predict_chords(audio_path: str) -> list[dict]:
    """Run BTC over the audio file and return merged chord intervals.

    Each entry: {"start", "end", "label", "standard", "confidence"}.
    """
    state = _load()
    config = state["config"]
    model: BTC_model = state["model"]
    device: torch.device = state["device"]
    mean: float = state["mean"]
    std: float = state["std"]
    idx_to_chord = state["idx_to_chord"]

    feature, feature_per_second, song_length_second = audio_file_to_features(
        audio_path, config
    )
    feature = feature.T  # (T, n_bins)
    feature = (feature - mean) / std

    n_timestep = config.model["timestep"]
    pad_count = n_timestep - (feature.shape[0] % n_timestep)
    if pad_count == n_timestep:
        pad_count = 0
    if pad_count:
        feature = np.pad(feature, ((0, pad_count), (0, 0)), mode="constant")

    num_instances = feature.shape[0] // n_timestep
    feat_tensor = torch.tensor(feature, dtype=torch.float32, device=device).unsqueeze(0)
    total_frames = num_instances * n_timestep
    valid_frames = total_frames - pad_count

    pred_indices = np.empty(total_frames, dtype=np.int64)
    confidences = np.empty(total_frames, dtype=np.float32)

    with torch.no_grad():
        for t in range(num_instances):
            chunk = feat_tensor[:, n_timestep * t : n_timestep * (t + 1), :]
            hidden, _ = model.self_attn_layers(chunk)
            logits = model.output_layer.output_projection(hidden)  # (1, T, C)
            probs = F.softmax(logits, dim=-1)
            top_probs, top_idx = probs.max(dim=-1)
            top_probs = top_probs.squeeze(0).cpu().numpy()
            top_idx = top_idx.squeeze(0).cpu().numpy()
            pred_indices[n_timestep * t : n_timestep * (t + 1)] = top_idx
            confidences[n_timestep * t : n_timestep * (t + 1)] = top_probs

    pred_indices = pred_indices[:valid_frames]
    confidences = confidences[:valid_frames]

    intervals: list[dict] = []
    if valid_frames == 0:
        return intervals

    cur_idx = int(pred_indices[0])
    cur_start_frame = 0
    cur_conf_sum = float(confidences[0])
    cur_count = 1

    def _flush(end_frame: int):
        if cur_idx in (168, 169):  # 'X' or 'N'
            return
        start_t = cur_start_frame * feature_per_second
        end_t = min(end_frame * feature_per_second, song_length_second)
        if end_t - start_t < 0.1:
            return
        label = idx_to_chord[cur_idx]
        intervals.append(
            {
                "start": round(start_t, 3),
                "end": round(end_t, 3),
                "label": label,
                "standard": _to_standard(label),
                "confidence": round(cur_conf_sum / cur_count, 3),
            }
        )

    for f in range(1, valid_frames):
        idx = int(pred_indices[f])
        if idx == cur_idx:
            cur_conf_sum += float(confidences[f])
            cur_count += 1
        else:
            _flush(f)
            cur_idx = idx
            cur_start_frame = f
            cur_conf_sum = float(confidences[f])
            cur_count = 1
    _flush(valid_frames)

    return intervals
