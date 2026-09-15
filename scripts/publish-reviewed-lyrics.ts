/** Reversible, optimistic-concurrency update of the reviewed recording only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { getTursoClient } from "../src/lib/turso";
import { parseLrc, findCurrentLineIndex } from "../src/lib/lrc-parser";
import { buildReviewedLyrics } from "./lib/reviewed-lyric-release";

async function main() {
  const root = ".runtime/lyric-review/";
  const read = (name: string) => JSON.parse(readFileSync(root + name, "utf8"));
  const candidate = read("complete-timing-candidate.json");
  const result = buildReviewedLyrics(candidate.words, read("repeat-audio-audit.json"), 255.315);
  assert.equal(result.report.lines, 37);
  assert.equal(result.report.words, 160);
  const lines = parseLrc(result.lyrics.synced_lrc);
  assert.equal(lines.length, 37);
  for (let i = 0; i < 4; i++) assert.equal(lines[i].text, lines[i + 4].text);
  for (let i = 34; i < 37; i++) assert.equal(lines[i].text, lines[33].text);
  assert.equal(lines[4].time, 39.1, "Known bad second-opening onset must be corrected");
  for (const [i, line] of lines.entries()) {
    assert.equal(findCurrentLineIndex(lines, line.time), i);
    assert.equal(findCurrentLineIndex(lines, line.time - 0.001), i - 1);
  }
  const expected = read("candidate.json").lyrics;
  const db = getTursoClient();
  const tx = await db.transaction("write");
  const songId = "6de35955-99fa-467a-8a96-0cdfb501cba9";
  try {
    const stem = (await tx.execute({ sql: "SELECT vocals_url FROM stems WHERE song_id = ?", args: [songId] })).rows[0];
    const mix = (await tx.execute({ sql: "SELECT url FROM stem_layers WHERE song_id = ? AND layer_key = 'vocals_rhythm'", args: [songId] })).rows[0];
    assert(String(stem?.vocals_url).endsWith("/vocals-79112089c084.mp3"), "Vocal changed");
    assert(String(mix?.url).endsWith("/vocals-rhythm-f132236de5e0.mp3"), "Mix changed");
    const existing = (await tx.execute({ sql: "SELECT * FROM lyrics WHERE song_id = ?", args: [songId] })).rows[0];
    assert(existing, "Expected previous lyrics");
    if (existing.synced_lrc === result.lyrics.synced_lrc && existing.source === result.lyrics.source) {
      await tx.rollback();
      console.log("Already published; no changes.", result.report);
      return;
    }
    assert.equal(existing.synced_lrc, expected.synced_lrc, "Lyrics changed since review");
    assert.equal(existing.source, expected.source, "Source changed since review");
    if (process.argv.includes("--publish")) {
      await tx.execute({ sql: "INSERT INTO lyrics_revisions (id, song_id, synced_lrc, plain_text, source) VALUES (?, ?, ?, ?, ?)", args: [randomUUID(), songId, existing.synced_lrc, existing.plain_text, existing.source] });
      await tx.execute({ sql: "UPDATE lyrics SET synced_lrc = ?, plain_text = ?, source = ? WHERE song_id = ?", args: [result.lyrics.synced_lrc, result.lyrics.plain_text, result.lyrics.source, songId] });
      await tx.commit();
      console.log("Published reviewed lyric occurrences; previous revision saved; audio and chords untouched.");
    } else {
      await tx.rollback();
      console.log("Validated; no production changes.");
    }
    console.log(result.report);
  } finally { tx.close(); db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
