"""Read-only timing audit. Never publishes lyrics or changes audio.

Independent chunk boundaries/no lyric prompt expose unstable Whisper timing.
Agreement is diagnostic evidence, NOT a ground-truth accuracy measurement.
"""
import json
from pathlib import Path
import librosa
import mlx_whisper
from lyrics_align import parse_catalog_lines, source_words, heard_words, align_word_sequences

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / ".runtime" / "lyric-review"
SONG = "6de35955-99fa-467a-8a96-0cdfb501cba9"

def main():
    candidate = json.loads((OUT / "candidate.json").read_text())
    lines = parse_catalog_lines(candidate["lyrics"])
    expected = source_words(lines)
    cached = OUT / "unprompted-vocal-windows.json"
    if cached.exists():
        transcription = json.loads(cached.read_text())
    else:
        y, sr = librosa.load(ROOT / ".runtime" / "accompaniment" / SONG / "vocals.mp3", sr=16000)
        transcription = {"segments": []}
        for offset in range(0, int(len(y) / sr), 45):
            result = mlx_whisper.transcribe(
                y[offset * sr:(offset + 45) * sr],
                path_or_hf_repo="mlx-community/whisper-large-v3-turbo",
                language="hi", word_timestamps=True,
                condition_on_previous_text=False, verbose=False,
            )
            for segment in result.get("segments", []):
                for word in segment.get("words", []):
                    word["start"] += offset
                    word["end"] += offset
                transcription["segments"].append(segment)
            print(f"Audited vocal window {offset}–{min(offset+45,len(y)/sr):.1f}s", flush=True)
        cached.write_text(json.dumps(transcription, ensure_ascii=False))
    heard = heard_words(transcription)
    mapping = align_word_sequences(expected, heard)
    # Published line starts vs freshly recognized first words. Only compare
    # strong text matches, and keep mismatches visible rather than guessing.
    comparisons = []
    for index, word in enumerate(expected):
        if word.word_index != 0 or index not in mapping:
            continue
        hi, similarity = mapping[index]
        if similarity < .75:
            continue
        comparisons.append({"line": word.line_index, "saved": lines[word.line_index].time,
                            "audit": heard[hi].start,
                            "delta": round(heard[hi].start-lines[word.line_index].time,3)})
    report = {"kind": "model-stability-not-ground-truth", "matched":len(mapping),
              "total":len(expected), "line_comparisons":comparisons,
              "over_250ms":sum(abs(x["delta"])>.25 for x in comparisons)}
    (OUT / "timing-audit.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report), flush=True)

if __name__ == "__main__":
    main()
