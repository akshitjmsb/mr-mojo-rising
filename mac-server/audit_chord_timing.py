"""Compare published chord transitions with guitar attack evidence (read-only).

An attack near a chord is necessary evidence, not proof the harmony changed.
"""
import json
from pathlib import Path
import requests
import numpy as np
import librosa

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / ".runtime" / "lyric-review"
SONG = "6de35955-99fa-467a-8a96-0cdfb501cba9"

def main():
    response = requests.get(f"https://mr-mojo-rising.vercel.app/api/songs/{SONG}", timeout=30)
    response.raise_for_status()
    data = response.json()
    y, sr = librosa.load(ROOT / ".runtime" / "accompaniment" / SONG / "guitar.mp3", sr=22050)
    hop = 256
    envelope = librosa.onset.onset_strength(y=y,sr=sr,hop_length=hop)
    attacks = librosa.onset.onset_detect(onset_envelope=envelope,sr=sr,hop_length=hop,units="time",backtrack=True)
    comparisons = []
    for chord in data["chords"]:
        t = chord["start_time"]
        if len(attacks):
            attack = float(attacks[np.argmin(np.abs(attacks-t))])
            comparisons.append({"time":t,"nearest_attack":round(attack,3),"delta":round(attack-t,3),"state":chord.get("verification_state")})
    report = {"kind":"attack-proximity-not-harmonic-ground-truth","transitions":len(comparisons),
              "over_180ms":sum(abs(x["delta"])>.18 for x in comparisons),
              "over_500ms":sum(abs(x["delta"])>.5 for x in comparisons),"comparisons":comparisons}
    (OUT / "chord-timing-audit.json").write_text(json.dumps(report,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!="comparisons"}))

if __name__ == "__main__":
    main()
