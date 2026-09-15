"""Experimental independent acoustic alignment; does not publish anything."""
import json
import sys
from pathlib import Path
import numpy as np
import torch
import torchaudio
import librosa
from lyrics_align import CatalogLine, parse_catalog_lines, source_words

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / ".runtime" / "lyric-review"
SONG = "6de35955-99fa-467a-8a96-0cdfb501cba9"

def main():
    torch.set_num_threads(4)
    torch.hub.set_dir(str(ROOT / ".runtime" / "cache" / "torch"))
    candidate = json.loads((OUT / "candidate.json").read_text())
    if "--occurrences" in sys.argv:
        occurrences = json.loads((OUT / "lyric-occurrences.json").read_text())
        expected = source_words([CatalogLine(x["start"],x["text"]) for x in occurrences])
    else:
        expected = source_words(parse_catalog_lines(candidate["lyrics"]))
    bundle = torchaudio.pipelines.MMS_FA
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    emissions_path = OUT / "mms-vocal-emissions.npz"
    if emissions_path.exists():
        cache = np.load(emissions_path)
        emissions, times = cache["emissions"], cache["times"]
    else:
        print(f"Loading independent acoustic model on {device}", flush=True)
        model = bundle.get_model().to(device)
        y, sr = librosa.load(ROOT / ".runtime" / "accompaniment" / SONG / "vocals.mp3", sr=bundle.sample_rate)
        parts, clocks = [], []
        with torch.inference_mode():
            for offset in range(0, len(y), 20 * sr):
                chunk = torch.from_numpy(y[offset:offset+20*sr]).unsqueeze(0).to(device)
                output, _ = model(chunk)
                output = output[0].cpu().numpy()
                parts.append(output)
                clocks.append(offset/sr + np.arange(len(output)) * .02)
                print(f"Acoustic evidence through {min(offset/sr+20,len(y)/sr):.1f}s", flush=True)
        emissions, times = np.concatenate(parts), np.concatenate(clocks)
        np.savez_compressed(emissions_path, emissions=emissions, times=times)
    # The waveform encoder's stride is 320 samples = 20ms at 16kHz.
    normalized = ["".join(c for c in word.normalized if c in bundle.get_dict()) for word in expected]
    if any(not word for word in normalized):
        raise ValueError("Unalignable transcript token")
    tokenized = bundle.get_tokenizer()(normalized)
    spans = bundle.get_aligner()(torch.from_numpy(emissions), tokenized)
    results = []
    for index, (word, word_spans) in enumerate(zip(expected, spans)):
        start = float(times[word_spans[0].start])
        end_index = word_spans[-1].end
        end = float(times[min(end_index-1,len(times)-1)]) + .02
        score = sum(s.score*(s.end-s.start) for s in word_spans) / sum(s.end-s.start for s in word_spans)
        results.append({"index":index,"line":word.line_index,"word_index":word.word_index,
                        "start":round(start,3),"end":round(end,3),"score":round(score,4)})
    name = "forced-occurrence-candidate.json" if "--occurrences" in sys.argv else "forced-timing-candidate.json"
    (OUT / name).write_text(json.dumps({"method":"mms-fa-experimental", "words":results},indent=2))
    print(json.dumps({"line_starts":[x for x in results if x["word_index"]==0]}),flush=True)

if __name__ == "__main__":
    main()
