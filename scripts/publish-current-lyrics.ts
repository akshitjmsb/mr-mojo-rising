/** Reviewed, insert-only backfill. Run without --publish for validation only. */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { getTursoClient } from "../src/lib/turso";
import { parseLrc } from "../src/lib/lrc-parser";

async function main() {
  const songId = "6de35955-99fa-467a-8a96-0cdfb501cba9";
  const candidate = JSON.parse(readFileSync(".runtime/lyric-review/candidate.json", "utf8"));
  const { lyrics, report } = candidate;
  assert(report.passed && report.word_coverage >= 0.85 && report.line_coverage >= 0.9);
  assert(lyrics.source.startsWith("local-vocal-align/"));
  const lines = parseLrc(lyrics.synced_lrc);
  assert.equal(lines.length, report.total_lines);
  for (const [i, line] of lines.entries()) {
    assert(line.time >= 0 && line.time < 255.315);
    assert(i === 0 || line.time > lines[i - 1].time);
    for (const [j, word] of (line.words ?? []).entries()) {
      assert(word.time >= line.time && word.time < (lines[i + 1]?.time ?? 255.315));
      assert(j === 0 || word.time >= line.words![j - 1].time);
    }
  }
  const db = getTursoClient();
  const tx = await db.transaction("write");
  try {
    const stem = (await tx.execute({ sql: "SELECT vocals_url FROM stems WHERE song_id = ?", args: [songId] })).rows[0];
    assert(String(stem?.vocals_url).endsWith("/vocals-79112089c084.mp3"), "Vocal changed; realign before publishing");
    const mix = (await tx.execute({ sql: "SELECT url FROM stem_layers WHERE song_id = ? AND layer_key = 'vocals_rhythm'", args: [songId] })).rows[0];
    assert(String(mix?.url).endsWith("/vocals-rhythm-f132236de5e0.mp3"), "Mix changed; review before publishing");
    const existing = (await tx.execute({ sql: "SELECT id FROM lyrics WHERE song_id = ?", args: [songId] })).rows;
    assert.equal(existing.length, 0, "Existing lyrics must not be overwritten");
    if (process.argv.includes("--publish")) {
      await tx.execute({ sql: "INSERT INTO lyrics (id, song_id, synced_lrc, plain_text, source) VALUES (?, ?, ?, ?, ?)", args: [randomUUID(), songId, lyrics.synced_lrc, lyrics.plain_text, lyrics.source] });
      await tx.commit();
      console.log("Published auto-aligned lyrics; audio untouched.");
    } else {
      await tx.rollback();
      console.log("Validation passed; no changes made.");
    }
    console.log(JSON.stringify({ lines: lines.length, matchedWords: report.matched_words, totalWords: report.total_words, lineOnly: lines.filter(line => !line.words).length }));
  } finally {
    tx.close();
    db.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
