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
  words?: LrcWord[];
}

export interface LrcWord {
  time: number;
  text: string;
}

const INLINE_TIMESTAMP_REGEX = /<(\d{1,3}):(\d{2})(?:\.(\d{2,3}))?>/g;

function timestampToSeconds(
  minutes: string,
  seconds: string,
  fraction?: string,
) {
  const milliseconds = fraction
    ? parseInt(fraction.padEnd(3, "0"), 10)
    : 0;
  return parseInt(minutes, 10) * 60 + parseInt(seconds, 10) + milliseconds / 1000;
}

function parseInlineWords(value: string): LrcWord[] {
  const matches = [...value.matchAll(INLINE_TIMESTAMP_REGEX)];
  return matches.flatMap((match, index) => {
    const text = value
      .slice(match.index! + match[0].length, matches[index + 1]?.index ?? value.length)
      .trim();
    if (!text) return [];
    return [
      {
        time: timestampToSeconds(match[1], match[2], match[3]),
        text,
      },
    ];
  });
}

/**
 * Parse an LRC string into an array of {time, text} objects sorted by time.
 */
export function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];
  const regex = /\[(\d{1,3}):(\d{2})(?:\.(\d{2,3}))?\]\s*(.*)/;

  for (const raw of lrc.split("\n")) {
    const match = raw.match(regex);
    if (!match) continue;

    const rawText = match[4].trim();
    const words = parseInlineWords(rawText);
    const text = rawText.replaceAll(INLINE_TIMESTAMP_REGEX, "").trim();

    if (!text) continue;

    lines.push({
      time: timestampToSeconds(match[1], match[2], match[3]),
      text,
      words: words.length > 0 ? words : undefined,
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
