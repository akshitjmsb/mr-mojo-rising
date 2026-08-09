"use client";

import { useMemo } from "react";
import type { TabNote } from "@/lib/database.types";
import {
  buildRhythmAttacks,
  buildRhythmStrokeGrid,
} from "@/lib/rhythm-attacks";

interface Props {
  notes: TabNote[];
  start: number;
  end: number;
  currentTime: number;
  active: boolean;
  bpm: number | null;
}

export default function RhythmTimeline({
  notes,
  start,
  end,
  currentTime,
  active,
  bpm,
}: Props) {
  const attacks = useMemo(
    () => buildRhythmAttacks(notes, start, end),
    [end, notes, start],
  );
  const strokes = useMemo(
    () => buildRhythmStrokeGrid(attacks, start, end, bpm),
    [attacks, bpm, end, start],
  );
  const subdivisionDuration =
    strokes.length > 1 ? strokes[1].time - strokes[0].time : end - start;
  const activeStroke = active
    ? Math.max(
        0,
        Math.min(
          strokes.length - 1,
          Math.floor((currentTime - start) / subdivisionDuration),
        ),
      )
    : -1;
  const rows = [strokes.slice(0, 8), strokes.slice(8, 16)].filter(
    (row) => row.length > 0,
  );

  return (
    <div
      className="border-y border-border-dark py-3"
      aria-label="Recommended down and up motion aligned to the guitar attacks"
    >
      <div className="space-y-3">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-8 gap-1">
            {row.map((stroke, index) => {
              const highlighted = stroke.index === activeStroke;
              return (
                <div
                  key={stroke.index}
                  className={`rounded-[2px] py-1.5 text-center transition-colors duration-75 ${
                    highlighted ? "bg-gold/10" : "bg-transparent"
                  }`}
                >
                  <span className="block font-josefin text-[8px] text-text-dark">
                    {index % 2 === 0 ? index / 2 + 1 : "&"}
                  </span>
                  <span
                    aria-label={`${stroke.direction}stroke${stroke.sounded ? ", play" : ", keep moving"}`}
                    className={`mt-1 block font-playfair text-[25px] leading-none transition-transform duration-75 ${
                      highlighted ? "scale-125" : "scale-100"
                    } ${
                      stroke.sounded
                        ? "text-gold"
                        : "text-text-darkest"
                    }`}
                  >
                    {stroke.direction === "down" ? "↓" : "↑"}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-2 text-center font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark">
        Gold · play &nbsp;&nbsp; Faint · keep moving
      </p>
    </div>
  );
}
