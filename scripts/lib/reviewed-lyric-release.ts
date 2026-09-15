import assert from "node:assert/strict";

export type AlignedWord = {
  line: number; word_index: number; text: string;
  start: number; end: number; start_score: number;
};
export type RepeatAudit = {
  source: number; target: number;
  words: Array<{
    word_index: number; anchor_score: number; mapped_start: number;
    candidate_start: number;
    transfer: { unambiguous: boolean; spread_seconds: number; round_trip_seconds: number };
  }>;
};

function stamp(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  return `${Math.floor(ms / 60000).toString().padStart(2, "0")}:${(Math.floor(ms / 1000) % 60).toString().padStart(2, "0")}.${(ms % 1000).toString().padStart(3, "0")}`;
}

/** Package reviewed acoustic evidence; scores are NOT a claim of timing accuracy. */
export function buildReviewedLyrics(words: AlignedWord[], audits: RepeatAudit[], duration: number) {
  assert(words.length > 0 && Number.isFinite(duration) && duration > 0);
  const corrected = words.map(word => ({ ...word }));
  const byKey = new Map(corrected.map(word => [`${word.line}:${word.word_index}`, word]));
  assert.equal(byKey.size, words.length, "Duplicate word coordinates");
  const proposals = new Map<string, number[]>();
  for (const audit of audits) {
    assert.notEqual(audit.source, audit.target);
    for (const mapped of audit.words) {
      const key = `${audit.target}:${mapped.word_index}`;
      const target = byKey.get(key);
      const source = byKey.get(`${audit.source}:${mapped.word_index}`);
      assert(target && source, "Audit refers to missing word");
      assert(Math.abs(target.start - mapped.candidate_start) < 0.001, "Stale repeat evidence");
      if (target.start_score >= 0.7 || mapped.anchor_score < 0.8 || source.start_score < 0.8) continue;
      if (!mapped.transfer.unambiguous || mapped.transfer.spread_seconds > 0.08 || mapped.transfer.round_trip_seconds > 0.05) continue;
      assert(Number.isFinite(mapped.mapped_start));
      const starts = proposals.get(key) ?? [];
      proposals.set(key, [...starts, mapped.mapped_start]);
    }
  }
  let transferred = 0;
  for (const [key, starts] of proposals) {
    // Conflicting independent transfers remain estimates, never averaged into certainty.
    if (Math.max(...starts) - Math.min(...starts) > 0.08) continue;
    starts.sort((a, b) => a - b);
    byKey.get(key)!.start = starts[Math.floor(starts.length / 2)];
    transferred++;
  }
  const lines: AlignedWord[][] = [];
  let previous = -1;
  for (const word of corrected) {
    assert(Number.isInteger(word.line) && word.line >= 0);
    assert(Number.isInteger(word.word_index) && word.word_index >= 0);
    assert(word.text.trim() && !/[\r\n<>\[\]]/.test(word.text), "Invalid lyric token");
    assert(Number.isFinite(word.start) && word.start >= 0 && word.start < duration);
    assert(word.start > previous, "Overlapping/reversed word starts require review");
    assert(word.start < word.end && word.end <= duration, "Invalid word bounds");
    const line = lines[word.line] ?? [];
    assert.equal(word.word_index, line.length, "Missing/out-of-order word");
    line.push(word);
    lines[word.line] = line;
    previous = word.start;
  }
  for (let i = 0; i < lines.length; i++) assert(lines[i]?.length, "Missing lyric occurrence");
  const weak = words.filter(word => word.start_score < 0.7).length;
  return {
    lyrics: {
      synced_lrc: lines.map(line => `[${stamp(line[0].start)}]${line.map(word => `<${stamp(word.start)}>${word.text}`).join(" ")}`).join("\n"),
      plain_text: lines.map(line => line.map(word => word.text).join(" ")).join("\n"),
      source: `local-vocal-align/mms-repeat-review-v1;timing=estimated;repeat_transfers=${transferred};unresolved=${weak - transferred}`,
    },
    report: { lines: lines.length, words: words.length, transferred, unresolved: weak - transferred },
  };
}
