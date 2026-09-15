import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewedLyrics, type AlignedWord, type RepeatAudit } from "./reviewed-lyric-release";
const words: AlignedWord[] = [
  { line: 0, word_index: 0, text: "hello", start: 1, end: 2, start_score: 0.95 },
  { line: 1, word_index: 0, text: "hello", start: 5, end: 6, start_score: 0.1 },
];
const audit: RepeatAudit = { source: 0, target: 1, words: [{ word_index: 0, anchor_score: 0.95, candidate_start: 5, mapped_start: 4.5, transfer: { unambiguous: true, spread_seconds: 0.02, round_trip_seconds: 0.01 } }] };
test("preserves separate repeated occurrences and applies supported correction", () => {
  const result = buildReviewedLyrics(words, [audit], 10);
  assert.equal(result.report.lines, 2);
  assert.equal(result.report.transferred, 1);
  assert.match(result.lyrics.synced_lrc, /\[00:04.500\]/);
  assert.match(result.lyrics.source, /timing=estimated/);
  assert.equal(words[1].start, 5);
});
test("ambiguous and conflicting mappings do not overwrite timing", () => {
  const ambiguous = structuredClone(audit);
  ambiguous.words[0].transfer.unambiguous = false;
  assert.equal(buildReviewedLyrics(words, [ambiguous], 10).report.unresolved, 1);
  const conflict = structuredClone(audit);
  conflict.words[0].mapped_start = 4;
  assert.equal(buildReviewedLyrics(words, [audit, conflict], 10).report.transferred, 0);
});
test("stale evidence, reordered words and invalid bounds fail closed", () => {
  assert.throws(() => buildReviewedLyrics([{ ...words[0] }, { ...words[1], start: 5.2 }], [audit], 10), /Stale/);
  assert.throws(() => buildReviewedLyrics([...words].reverse(), [], 10), /reversed/);
  assert.throws(() => buildReviewedLyrics(words, [], 4), /assertion/i);
});
