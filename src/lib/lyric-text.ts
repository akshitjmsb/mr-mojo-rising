// Remove explicit catalog credits, never ordinary lines containing these words.
const CREDIT = /^\s*(?:作词|作詞|作曲|编曲|編曲|词|詞|曲|lyricist|composer|arranger|lyrics\s+by|music\s+by|written\s+by|produced\s+by)\s*[:：]/i;
export function cleanLyricText(text: string): string {
  return text.split(/\r?\n/).filter(line => !CREDIT.test(line.replace(/^\[\d+:\d+(?:\.\d+)?\]\s*/, ""))).join("\n").trim();
}
