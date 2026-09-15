"""Recover repeated lyric occurrences from recognized audio, not catalog count.

Returns candidates for acoustic alignment/review, never a timing accuracy pass.
"""
from rapidfuzz.fuzz import ratio


def recover_occurrences(lines, heard, normalize, min_similarity=.62):
    unique = {}
    for line in lines:
        key = normalize(line.text)
        if key:
            unique.setdefault(key, line.text)
    n = len(heard)
    # Weighted sequence selection: permit repeats but never reuse heard words.
    best = [0.0] * (n + 1)
    choice = [None] * (n + 1)
    for i in range(n-1,-1,-1):
        best[i] = best[i+1] - .10
        for j in range(i+1,min(n,i+14)+1):
            if heard[j-1].end-heard[i].start > 12:
                break
            phrase = "".join(w.normalized for w in heard[i:j])
            for key, text in unique.items():
                similarity = ratio(phrase,key)/100
                if similarity < min_similarity:
                    continue
                # Longer well-matched coverage beats fragments, with a penalty
                # for every phrase so arbitrary splitting cannot improve score.
                score = (j-i)*(similarity-.45) - .15 + best[j]
                if score > best[i]:
                    best[i] = score
                    choice[i] = (j,text,similarity)
    result=[]
    i=0
    while i<n:
        item=choice[i]
        if item is None:
            i+=1
            continue
        j,text,similarity=item
        result.append({"text":text,"start":heard[i].start,"end":heard[j-1].end,
                       "heard_start":i,"heard_end":j,"similarity":round(similarity,3)})
        i=j
    return result
