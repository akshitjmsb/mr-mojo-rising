import test from "node:test";
import assert from "node:assert/strict";
import { parseLessonInput, youtubeLessonUrl } from "./lesson-input";
import { lessonPlayback, lessonTab, type LessonPack, type LessonPhrase, type LessonSection } from "./lesson-types";

test("only canonical YouTube lesson URLs reach the worker", () => {
  assert.equal(youtubeLessonUrl("https://youtu.be/WHujjJEnZpI?si=tracking"), "https://www.youtube.com/watch?v=WHujjJEnZpI");
  for (const url of ["http://youtube.com/watch?v=WHujjJEnZpI", "https://youtube.com.evil.test/watch?v=WHujjJEnZpI", "https://user@youtube.com/watch?v=WHujjJEnZpI", "https://youtube.com:444/watch?v=WHujjJEnZpI", "file:///etc/passwd"]) assert.equal(youtubeLessonUrl(url), null);
});
test("intake rejects invalid and oversized transcripts", () => {
  assert.throws(() => parseLessonInput({ transcript: "x" }));
  assert.throws(() => parseLessonInput({ transcript: 13 }));
  assert.throws(() => parseLessonInput({ transcript: "x".repeat(150001) }));
  assert.equal(parseLessonInput({ transcript: "The teacher plays the open fourth string." }).url, null);
});
test("tab retains taught string positions and simultaneous notes", () => {
  const lines = lessonTab([{ string: 4, fret: 7, slot: 0, technique: "" }, { string: 3, fret: 7, slot: 0, technique: "" }, { string: 2, fret: 5, slot: 1, technique: "h" }]).split("\n");
  assert.equal(lines.length, 6);
  assert.ok(lines[2].includes("7")); assert.ok(lines[3].includes("7"));
  assert.ok(lines[1].includes("5h")); assert.ok(!lines[0].includes("7"));
  assert.equal(new Set(lines.map(line => line.length)).size, 1);
});

const source: LessonPack["source"] = { url: "https://www.youtube.com/watch?v=WHujjJEnZpI", title: "Lesson", channel: null, duration: 90, captions: "Captions" };
const section: LessonSection = { title: "Intro", start: 20, end: 80, chords: [], strumming: { value: null, evidence: [], review: null }, picking: { value: null, evidence: [], review: null }, phrases: [], tips: [] };
const phrase: LessonPhrase = { title: "Riff", start: null, end: null, notes: [], evidence: [{ kind: "visual", at: 30, detail: "Tab" }, { kind: "transcript", at: 70, detail: "Play this" }], review: null };
test("unknown phrase timing uses a labelled bounded source cue without changing the pack", () => {
  assert.deepEqual(lessonPlayback(source, section, phrase), { start: 68, end: 80, kind: "cue" });
  assert.equal(phrase.start, null);
  assert.equal(phrase.end, null);
  assert.deepEqual(lessonPlayback(source, section, { ...phrase, evidence: [{ kind: "visual", at: 12, detail: "Outside section" }] }), { start: 20, end: 80, kind: "section" });
});
test("known phrase bounds survive and untimed pasted text gains no audio cue", () => {
  assert.deepEqual(lessonPlayback(source, section, { ...phrase, start: 40, end: 45 }), { start: 40, end: 45, kind: "phrase" });
  assert.deepEqual(lessonPlayback({ ...source, url: null, duration: null }, { ...section, start: null, end: null }, phrase), { start: null, end: null, kind: "section" });
});
