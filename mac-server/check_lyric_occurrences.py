import json
from pathlib import Path
from lyrics_align import parse_catalog_lines, heard_words, _normalize
from lyric_occurrences import recover_occurrences

root=Path(__file__).resolve().parent.parent/".runtime"/"lyric-review"
candidate=json.loads((root/"candidate.json").read_text())
transcription=json.loads((root/"unprompted-vocal-windows.json").read_text())
occurrences=recover_occurrences(parse_catalog_lines(candidate["lyrics"]),heard_words(transcription),_normalize)
(root/"lyric-occurrences.json").write_text(json.dumps(occurrences,ensure_ascii=False,indent=2))
print(json.dumps({"count":len(occurrences),"windows":[{k:v for k,v in x.items() if k!="text"} for x in occurrences]}))
