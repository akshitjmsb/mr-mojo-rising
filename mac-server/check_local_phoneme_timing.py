"""Constrain independent phoneme alignment to recognized lyric occurrences.

Keeps native-script ASR text for normalization; catalog spelling is not the
acoustic model's phonetic alphabet. Trial only, no database or audio mutation.
"""
import json
import re
import sys
from pathlib import Path
import numpy as np
import torch
import torchaudio
from lyrics_align import heard_words

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/".runtime"/"lyric-review"
sys.path.insert(0,str(OUT/"python-deps"))
from uroman import Uroman

def main():
    torch.set_num_threads(4)
    romanizer=Uroman()
    cache=np.load(OUT/"mms-vocal-emissions.npz")
    emissions,times=cache["emissions"],cache["times"]
    occurrences=json.loads((OUT/"lyric-occurrences.json").read_text())
    heard=heard_words(json.loads((OUT/"unprompted-vocal-windows.json").read_text()))
    bundle=torchaudio.pipelines.MMS_FA
    results=[]
    for line,item in enumerate(occurrences):
        words=heard[item["heard_start"]:item["heard_end"]]
        normalized=[re.sub("[^a-z']","",romanizer.romanize_string(w.text,lcode="hin").lower()) for w in words]
        if not all(normalized):
            raise ValueError("Empty normalized token")
        left=int(np.searchsorted(times,max(0,item["start"]-2)))
        right=int(np.searchsorted(times,item["end"]+2))
        # Padding windows contain neighboring sung words. Wildcards absorb
        # that context instead of forcing it into this line's first/last word.
        spans=bundle.get_aligner()(torch.from_numpy(emissions[left:right]),bundle.get_tokenizer()(["*",*normalized,"*"]))[1:-1]
        for wi,(word,parts) in enumerate(zip(words,spans)):
            score=sum(s.score*(s.end-s.start) for s in parts)/sum(s.end-s.start for s in parts)
            start=float(times[left+parts[0].start])
            end=float(times[left+parts[-1].end-1])+.02
            results.append({"line":line,"word_index":wi,"heard_index":item["heard_start"]+wi,
                            "start":round(start,3),"end":round(end,3),"score":round(score,3),
                            "asr_start":word.start,"delta":round(start-word.start,3)})
    report={"method":"mms-fa-local-native-script","words":results,
            "low_score":sum(w["score"]<.5 for w in results),
            "over_250ms":sum(abs(w["delta"])>.25 for w in results)}
    (OUT/"local-phoneme-candidate.json").write_text(json.dumps(report,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!="words"}))
    print(json.dumps([w for w in results if w["word_index"]==0]))

if __name__=="__main__":
    main()
