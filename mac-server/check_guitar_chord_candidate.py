"""Trial chord timing from the actual guitar stem; no DB/audio mutations."""
import json
from pathlib import Path
import torch
from btc.inference import predict_chords
from chord_truth_gate import verify_chord_candidates,verified_count

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/".runtime"/"lyric-review"
SONG="6de35955-99fa-467a-8a96-0cdfb501cba9"

def main():
    torch.set_num_threads(4)
    guitar=ROOT/".runtime"/"accompaniment"/SONG/"guitar.mp3"
    candidates=predict_chords(str(guitar))
    checked=verify_chord_candidates(candidates,guitar_audio_path=str(guitar))
    (OUT/"guitar-chord-candidate.json").write_text(json.dumps(checked,indent=2))
    print(json.dumps({"raw":len(candidates),"merged":len(checked),"supported":verified_count(checked)}),flush=True)

if __name__=="__main__":
    main()
