"""Inspect unresolved acoustic anchors against within-occurrence recognition."""
import json
from pathlib import Path
from lyrics_align import CatalogLine,source_words,heard_words,align_word_sequences

OUT=Path(__file__).resolve().parent.parent/".runtime"/"lyric-review"
c=json.loads((OUT/"complete-timing-candidate.json").read_text())
repeats=json.loads((OUT/"repeat-audio-audit.json").read_text())
main=heard_words(json.loads((OUT/"unprompted-vocal-windows.json").read_text()))
tail=heard_words(json.loads((OUT/"tail-185-225.json").read_text()))
results=[]
for w in c["words"]:
    if w["start_score"]>=.7:
        continue
    repeat=next((r for r in repeats if r["target"]==w["line"]),None)
    mapped=next((x for x in repeat["words"] if x["word_index"]==w["word_index"]),None) if repeat else None
    if mapped and mapped["anchor_score"]>=.8 and mapped["transfer"]["unambiguous"]:
        continue
    occurrence=c["occurrences"][w["line"]]
    heard=(main if w["line"]<30 else tail)[occurrence["heard_start"]:occurrence["heard_end"]]
    expected=source_words([CatalogLine(occurrence["start"],occurrence["text"])])
    matches=align_word_sequences(expected,heard)
    match=matches.get(w["word_index"])
    evidence={"line":w["line"],"word":w["word_index"],"candidate":w["start"],"start_score":w["start_score"]}
    if match:
        hi,similarity=match
        evidence.update({"asr_start":heard[hi].start,"delta":round(heard[hi].start-w["start"],3),"similarity":round(similarity,3)})
    results.append(evidence)
(OUT/"remaining-word-audit.json").write_text(json.dumps(results,indent=2))
print(json.dumps(results))
