"""Cross-check repeated phrases directly against vocal acoustics via DTW.

Read-only evidence, not a standalone accuracy gate. High-score boundaries in
one occurrence are mapped to other performances of the same phrase.
"""
import json
from pathlib import Path
import numpy as np
import librosa
from repeat_timing import transfer_frame

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/".runtime"/"lyric-review"
SONG="6de35955-99fa-467a-8a96-0cdfb501cba9"

def main():
    candidate=json.loads((OUT/"complete-timing-candidate.json").read_text())
    y,sr=librosa.load(ROOT/".runtime"/"accompaniment"/SONG/"vocals.mp3",sr=16000)
    hop=160
    features=librosa.feature.mfcc(y=y,sr=sr,n_mfcc=20,n_fft=512,hop_length=hop)
    features=(features-features.mean(axis=1,keepdims=True))/(features.std(axis=1,keepdims=True)+1e-6)
    groups={}
    words={}
    for i,o in enumerate(candidate["occurrences"]):
        groups.setdefault(o["text"],[]).append(i)
        words[i]=[w for w in candidate["words"] if w["line"]==i]
    reports=[]
    for indexes in groups.values():
        if len(indexes)<2:
            continue
        source=max(indexes,key=lambda i:sum(w["start_score"] for w in words[i]))
        source_start=max(0,candidate["occurrences"][source]["start"]-1)
        source_end=candidate["occurrences"][source]["end"]+1
        sa,sb=round(source_start*sr/hop),round(source_end*sr/hop)
        for target in indexes:
            if target==source:
                continue
            target_start=max(0,candidate["occurrences"][target]["start"]-1)
            target_end=candidate["occurrences"][target]["end"]+1
            ta,tb=round(target_start*sr/hop),round(target_end*sr/hop)
            costs,path=librosa.sequence.dtw(X=features[:,sa:sb],Y=features[:,ta:tb],metric="cosine",global_constraints=True,band_rad=.25)
            path=path[::-1]
            mappings=[]
            for w in words[source]:
                frame=round(w["start"]*sr/hop)-sa
                transfer=transfer_frame(path,frame,frame_seconds=hop/sr)
                if transfer is None:
                    continue
                predicted=(ta+transfer["target_frame"])*hop/sr
                actual=words[target][w["word_index"]]["start"]
                mappings.append({"word_index":w["word_index"],"anchor_score":w["start_score"],"mapped_start":round(predicted,3),"candidate_start":actual,"delta":round(predicted-actual,3),"transfer":transfer})
            reports.append({"source":source,"target":target,"mean_cost":round(float(costs[-1,-1]/len(path)),3),"words":mappings})
    (OUT/"repeat-audio-audit.json").write_text(json.dumps(reports,indent=2))
    print(json.dumps([{"source":r["source"],"target":r["target"],"mean_cost":r["mean_cost"],"first":r["words"][0] if r["words"] else None} for r in reports]))

if __name__=="__main__":
    main()
