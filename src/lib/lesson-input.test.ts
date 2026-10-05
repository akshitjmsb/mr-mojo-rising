import test from "node:test";
import assert from "node:assert/strict";
import { parseLessonInput, youtubeLessonUrl } from "./lesson-input";
import { lessonTab } from "./lesson-types";

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
