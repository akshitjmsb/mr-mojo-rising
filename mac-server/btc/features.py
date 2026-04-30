"""Audio→CQT feature extraction and BTC chord vocabulary.

Subset of BTC-ISMIR19 (utils/mir_eval_modules.py) — only the pieces inference needs.
Source: https://github.com/jayg996/BTC-ISMIR19
License: MIT.
"""

import librosa
import numpy as np


idx2chord = [
    "C", "C:min", "C#", "C#:min", "D", "D:min", "D#", "D#:min",
    "E", "E:min", "F", "F:min", "F#", "F#:min", "G", "G:min",
    "G#", "G#:min", "A", "A:min", "A#", "A#:min", "B", "B:min", "N",
]

_root_list = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_quality_list = [
    "min", "maj", "dim", "aug", "min6", "maj6", "min7", "minmaj7",
    "maj7", "7", "dim7", "hdim7", "sus2", "sus4",
]


def idx2voca_chord():
    table = {169: "N", 168: "X"}
    for i in range(168):
        root = _root_list[i // 14]
        quality = _quality_list[i % 14]
        table[i] = root if (i % 14) == 1 else f"{root}:{quality}"
    return table


def audio_file_to_features(audio_file, config):
    """CQT log-magnitude features matching the BTC training pipeline.

    Returns (feature[n_bins, T], seconds_per_frame, song_duration_seconds).
    """
    original_wav, sr = librosa.load(audio_file, sr=config.mp3["song_hz"], mono=True)
    chunk_samples = int(config.mp3["song_hz"] * config.mp3["inst_len"])
    parts = []
    cursor = 0
    while len(original_wav) > cursor + chunk_samples:
        parts.append(
            librosa.cqt(
                original_wav[cursor : cursor + chunk_samples],
                sr=sr,
                n_bins=config.feature["n_bins"],
                bins_per_octave=config.feature["bins_per_octave"],
                hop_length=config.feature["hop_length"],
            )
        )
        cursor += chunk_samples
    parts.append(
        librosa.cqt(
            original_wav[cursor:],
            sr=sr,
            n_bins=config.feature["n_bins"],
            bins_per_octave=config.feature["bins_per_octave"],
            hop_length=config.feature["hop_length"],
        )
    )
    feature = np.concatenate(parts, axis=1)
    feature = np.log(np.abs(feature) + 1e-6)
    feature_per_second = config.mp3["inst_len"] / config.model["timestep"]
    song_length_second = len(original_wav) / config.mp3["song_hz"]
    return feature, feature_per_second, song_length_second
