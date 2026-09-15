"""Assemble complete repeated passages and audit acoustic word boundaries.

Read-only experiment. Does not turn acoustic scores into an accuracy claim.
"""
import json
import re
from pathlib import Path
import numpy as np
import torch
import torchaudio
from lyrics_align import CatalogLine,source_words

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/".runtime"/"lyric-review"

def phonetic_spelling(value):
    # Common romanized Hindi long-vowel spellings, not display-text changes.
    return re.sub("[^a-z']","",value.lower().replace("aa","a").replace("ee","i").replace("oo","u"))

def main():
    torch.set_num_threads(4)
    original=json.loads((OUT/"lyric-occurrences.json").read_text())
    tail=json.loads((OUT/"tail-review.json").read_text())
    # The 185–225 window includes the complete final passage; the other two
    # windows corroborate repeated refrains but truncate leading/trailing words.
    occurrences=[o for o in original if o["start"]<185]+tail[0]["occurrences"]
    cache=np.load(OUT/"mms-vocal-emissions.npz")
    emissions,times=cache["emissions"],cache["times"]
    bundle=torchaudio.pipelines.MMS_FA
    results=[]
    for line,item in enumerate(occurrences):
        words=source_words([CatalogLine(item["start"],item["text"])])
        normalized=[phonetic_spelling(w.text) for w in words]
        left=int(np.searchsorted(times,max(0,item["start"]-2)))
        right=int(np.searchsorted(times,item["end"]+2))
        spans=bundle.get_aligner()(torch.from_numpy(emissions[left:right]),bundle.get_tokenizer()(["*",*normalized,"*"]))[1:-1]
        for wi,(word,parts) in enumerate(zip(words,spans)):
            score=sum(s.score*(s.end-s.start) for s in parts)/sum(s.end-s.start for s in parts)
            start=float(times[left+parts[0].start])
            end=float(times[left+parts[-1].end-1])+.02
            results.append({"line":line,"word_index":wi,"text":word.text,
                            "start":round(start,3),"end":round(end,3),"score":round(score,3),
                            "start_score":round(parts[0].score,3),"end_score":round(parts[-1].score,3)})
    report={"method":"mms-fa-complete-occurrences-experimental","occurrences":occurrences,"words":results,
            "weak_start":sum(w["start_score"]<.7 for w in results),
            "weak_line_start":sum(w["start_score"]<.7 for w in results if w["word_index"]==0)}
    (OUT/"complete-timing-candidate.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({"lines":len(occurrences),"words":len(results),"weak_start":report["weak_start"],"weak_line_start":report["weak_line_start"]}))
    print(json.dumps([{k:v for k,v in w.items() if k!="text"} for w in results if w["word_index"]==0]))

if __name__=="__main__":
    main()
