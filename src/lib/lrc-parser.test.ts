import assert from "node:assert/strict";
import test from "node:test";
import { findActiveWordKey, findCurrentLineIndex, type LrcLine } from "./lrc-parser";

test("keeps the underline on the active line when repeated lyrics overlap", () => {
  const lines: LrcLine[] = [
    {
      time: 10,
      text: "jane na koi",
      words: [
        { time: 10, text: "jane" },
        { time: 11, text: "na" },
        { time: 12, text: "koi" },
      ],
    },
    {
      time: 20,
      text: "jane na koi",
      // Simulate a noisy aligner placing future-line words too early.
      words: [
        { time: 10.4, text: "jane" },
        { time: 11.4, text: "na" },
        { time: 12.4, text: "koi" },
      ],
    },
  ];
  const currentTime = 11.5;
  const currentLine = findCurrentLineIndex(lines, currentTime);

  assert.equal(currentLine, 0);
  assert.equal(findActiveWordKey(lines, currentLine, currentTime), "0:1");
});

test("withholds the underline until the active line has a due word", () => {
  const lines: LrcLine[] = [
    {
      time: 10,
      text: "jane na koi",
      words: [{ time: 10.5, text: "jane" }],
    },
  ];

  assert.equal(findActiveWordKey(lines, 0, 10.2), null);
});
