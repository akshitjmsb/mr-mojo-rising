/**
 * Parse LRC (synced lyrics) format into timed lines.
 *
 * LRC format example:
 *   [00:12.34] First line of lyrics
 *   [00:18.56] Second line
 */

export interface LrcLine {
  time: number; // seconds
  text: string;
}

/**
 * Parse an LRC string into an array of {time, text} objects sorted by time.
 */
export function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];
  const regex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]\s*(.*)/;

  for (const raw of lrc.split("\n")) {
    const match = raw.match(regex);
    if (!match) continue;

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const ms = match[3] ? parseInt(match[3].padEnd(3, "0"), 10) : 0;
    const text = match[4].trim();

    if (!text) continue;

    lines.push({
      time: minutes * 60 + seconds + ms / 1000,
      text,
    });
  }

  return lines.sort((a, b) => a.time - b.time);
}

/**
 * Find the index of the current lyric line based on playback time.
 * Returns -1 if before the first line.
 */
export function findCurrentLineIndex(lines: LrcLine[], currentTime: number): number {
  if (lines.length === 0) return -1;

  for (let i = lines.length - 1; i >= 0; i--) {
    if (currentTime >= lines[i].time) return i;
  }

  return -1;
}
