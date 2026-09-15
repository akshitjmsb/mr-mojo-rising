"""Recheck final sung passages with overlapping windows; no publishing."""
import json
from pathlib import Path
import librosa
import mlx_whisper
from lyrics_align import heard_words,parse_catalog_lines,_normalize
from lyric_occurrences import recover_occurrences

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/".runtime"/"lyric-review"
SONG="6de35955-99fa-467a-8a96-0cdfb501cba9"

def main():
    y,sr=librosa.load(ROOT/".runtime"/"accompaniment"/SONG/"vocals.mp3",sr=16000)
    lines=parse_catalog_lines(json.loads((OUT/"candidate.json").read_text())["lyrics"])
    reports=[]
    for start,end in [(185,225),(195,235),(205,245)]:
        cache=OUT/f"tail-{start}-{end}.json"
        if cache.exists():
            result=json.loads(cache.read_text())
        else:
            result=mlx_whisper.transcribe(y[start*sr:end*sr],path_or_hf_repo="mlx-community/whisper-large-v3-turbo",language="hi",word_timestamps=True,condition_on_previous_text=False,verbose=False)
            for s in result.get("segments",[]):
                for w in s.get("words",[]):
                    w["start"]+=start
                    w["end"]+=start
            cache.write_text(json.dumps(result,ensure_ascii=False))
        occurrences=recover_occurrences(lines,heard_words(result),_normalize)
        reports.append({"window":[start,end],"occurrences":occurrences})
        print(json.dumps({"window":[start,end],"occurrences":[{k:v for k,v in o.items() if k!="text"} for o in occurrences]}),flush=True)
    (OUT/"tail-review.json").write_text(json.dumps(reports,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
