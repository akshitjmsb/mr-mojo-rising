"""Conservative agreement gate for independently generated word timings.

This measures agreement, not perceptual truth. Missing, low-score or disagreeing
anchors explicitly prevent promotion; coverage alone never passes the gate.
"""
import math


def timing_agreement(candidate, reference, *, tolerance=.25, min_score=.5):
    refs = {(w["line"], w["word_index"]): w for w in reference}
    issues = []
    errors = []
    seen = set()
    previous = -1.0
    for word in candidate:
        key = (word["line"], word["word_index"])
        start = word["start"]
        if key in seen or not math.isfinite(start) or start < previous:
            issues.append({"key":key,"reason":"invalid_sequence"})
        seen.add(key)
        previous = start
        ref = refs.get(key)
        if ref is None or not math.isfinite(ref.get("score",0)) or ref.get("score",0) < min_score:
            issues.append({"key":key,"reason":"missing_acoustic_support"})
            continue
        if not math.isfinite(ref["start"]):
            issues.append({"key":key,"reason":"invalid_reference"})
            continue
        error = abs(start-ref["start"])
        errors.append(error)
        if error > tolerance:
            issues.append({"key":key,"reason":"timing_disagreement","seconds":round(error,3)})
    missing = set(refs)-seen
    issues.extend({"key":key,"reason":"missing_candidate"} for key in sorted(missing))
    return {"passed": bool(candidate) and not issues,
            "kind":"independent_timing_agreement_not_ground_truth",
            "compared":len(errors), "max_error_seconds":max(errors,default=None),
            "issues":issues}
