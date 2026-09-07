export const DEFAULT_SONG_LAYER = "vocals" as const;

export type PlaybackRange = { start: number; end: number };

export function adjustRangeEdge(
  range: PlaybackRange,
  edge: "start" | "end",
  time: number,
  bounds: PlaybackRange,
): PlaybackRange {
  const gap = Math.min(0.5, bounds.end - bounds.start);
  const rounded = Math.round(time * 10) / 10;
  return edge === "start"
    ? { ...range, start: Math.max(bounds.start, Math.min(range.end - gap, rounded)) }
    : { ...range, end: Math.min(bounds.end, Math.max(range.start + gap, rounded)) };
}

export function fullSongRange(
  sections: Array<{ start_time: number; end_time: number }>,
): PlaybackRange | null {
  if (sections.length === 0) return null;
  return {
    start: Math.min(...sections.map((section) => section.start_time)),
    end: Math.max(...sections.map((section) => section.end_time)),
  };
}

export function skipWithinRange(
  currentTime: number,
  seconds: number,
  range: PlaybackRange,
) {
  return Math.max(range.start, Math.min(range.end, currentTime + seconds));
}
