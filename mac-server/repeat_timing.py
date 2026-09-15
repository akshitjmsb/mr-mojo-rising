"""Timing transfer evidence from an audio-to-audio alignment path."""
import numpy as np


def transfer_frame(path, source_frame, *, frame_seconds=.01):
    path=np.asarray(path)
    candidates=path[np.abs(path[:,0]-source_frame)<=1,1]
    if not len(candidates):
        return None
    target=float(np.median(candidates))
    reverse=path[np.abs(path[:,1]-target)<=1,0]
    if not len(reverse):
        return None
    spread=float(np.ptp(candidates))*frame_seconds
    return_error=abs(float(np.median(reverse))-source_frame)*frame_seconds
    return {"target_frame":target,"spread_seconds":spread,
            "round_trip_seconds":return_error,
            "unambiguous":spread<=.08 and return_error<=.05}
