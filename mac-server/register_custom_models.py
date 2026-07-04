"""Register community separation models that audio-separator doesn't ship.

audio-separator only loads models listed in its packaged models.json, so this
script downloads the checkpoint + config into SEPARATOR_MODEL_DIR and appends a
registry entry inside venv-sep. Re-run after rebuilding venv-sep or upgrading
audio-separator. Idempotent.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MODELS_JSON = (
    SCRIPT_DIR / "venv-sep" / "lib" / "python3.11" / "site-packages" / "audio_separator" / "models.json"
)
MODEL_DIR = Path(
    os.environ.get(
        "SEPARATOR_MODEL_DIR",
        str(Path.home() / "Library" / "Application Support" / "MrMojoRising" / "separator-models"),
    )
).expanduser()

# friendly name -> (local ckpt, local yaml, base URL, remote ckpt, remote yaml)
# Local names MUST contain "roformer" — audio-separator picks the architecture
# by sniffing the filename, and otherwise misloads these as MDX23C.
CUSTOM_MODELS = {
    "Roformer Model: MelBand Roformer | Guitar by becruily": (
        "mel_band_roformer_guitar_becruily.ckpt",
        "config_mel_band_roformer_guitar_becruily.yaml",
        "https://huggingface.co/becruily/mel-band-roformer-guitar/resolve/main",
        "becruily_guitar.ckpt",
        "config_guitar_becruily.yaml",
    ),
}


# Upstream bug in audio-separator <= 0.44.2: MelBandRoformer builds its
# MaskEstimator without forwarding mlp_expansion_factor, so models trained with
# a non-default factor (like becruily guitar, factor 1) fail to load.
MEL_ROFORMER_PY = (
    SCRIPT_DIR
    / "venv-sep"
    / "lib"
    / "python3.11"
    / "site-packages"
    / "audio_separator"
    / "separator"
    / "uvr_lib_v5"
    / "roformer"
    / "mel_band_roformer.py"
)
MASK_ESTIMATOR_OLD = (
    "mask_estimator = MaskEstimator(dim=dim, dim_inputs=freqs_per_bands_with_complex, "
    "depth=mask_estimator_depth)"
)
MASK_ESTIMATOR_NEW = (
    "mask_estimator = MaskEstimator(dim=dim, dim_inputs=freqs_per_bands_with_complex, "
    "depth=mask_estimator_depth, mlp_expansion_factor=mlp_expansion_factor)"
)


def patch_mask_estimator() -> None:
    src = MEL_ROFORMER_PY.read_text()
    if MASK_ESTIMATOR_NEW in src:
        print("mel_band_roformer.py already patched")
    elif MASK_ESTIMATOR_OLD in src:
        MEL_ROFORMER_PY.write_text(src.replace(MASK_ESTIMATOR_OLD, MASK_ESTIMATOR_NEW))
        print("patched mel_band_roformer.py to forward mlp_expansion_factor")
    else:
        print("WARNING: MaskEstimator pattern not found — check if upstream fixed it", file=sys.stderr)


def main() -> int:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    patch_mask_estimator()
    registry = json.loads(MODELS_JSON.read_text())
    roformer_list = registry["roformer_download_list"]
    changed = False

    for friendly_name, (ckpt, yaml_cfg, base_url, remote_ckpt, remote_yaml) in CUSTOM_MODELS.items():
        for filename, remote in ((ckpt, remote_ckpt), (yaml_cfg, remote_yaml)):
            dest = MODEL_DIR / filename
            if not dest.exists() or dest.stat().st_size < 1024:
                print(f"downloading {remote} -> {filename}...")
                subprocess.run(
                    ["curl", "-sL", "--fail", "-o", str(dest), f"{base_url}/{remote}"],
                    check=True,
                )
        if roformer_list.get(friendly_name) != {ckpt: yaml_cfg}:
            roformer_list[friendly_name] = {ckpt: yaml_cfg}
            changed = True

    if changed:
        MODELS_JSON.write_text(json.dumps(registry, indent=2))
        print(f"registered {len(CUSTOM_MODELS)} custom model(s) in {MODELS_JSON}")
    else:
        print("registry already up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
