"use client";

import type { Section } from "@/lib/database.types";
import type { LearningRange } from "@/lib/learning-range";

interface Props {
  section: Section;
  sectionLabel: string;
  range: LearningRange;
  onChangeSection: () => void;
  onBoundaryChange: (boundary: "start" | "end", value: number) => void;
  onBoundaryCommit: () => void;
}

function formatPreciseTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = (safeSeconds % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${remainder}`;
}

export default function LearningRangePicker({
  section,
  sectionLabel,
  range,
  onChangeSection,
  onBoundaryChange,
  onBoundaryCommit,
}: Props) {
  return (
    <div className="rounded-[2px] border border-gold/35 bg-bg/45 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-playfair text-[19px] italic text-gold">
            {sectionLabel}
          </p>
          <p className="mt-0.5 font-josefin text-[8px] tracking-[0.08em] text-text-dark">
            {formatPreciseTime(section.start_time)}–
            {formatPreciseTime(section.end_time)}
          </p>
        </div>
        <button
          type="button"
          onClick={onChangeSection}
          className="min-h-9 cursor-pointer border-none bg-transparent px-2 font-josefin text-[7px] uppercase tracking-[0.12em] text-text-muted"
        >
          Change part
        </button>
      </div>

      <details className="mt-3 border-t border-border-dark pt-2">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between font-josefin text-[8px] uppercase tracking-[0.1em] text-text-muted [&::-webkit-details-marker]:hidden">
          <span>Adjust start &amp; end</span>
          <span className="tabular-nums text-text-dark">
            {formatPreciseTime(range.start)}–{formatPreciseTime(range.end)}
          </span>
        </summary>
        <div className="mt-2 space-y-3">
          {(["start", "end"] as const).map((boundary) => {
            const value = boundary === "start" ? range.start : range.end;
            const minimum =
              boundary === "start" ? section.start_time : range.start + 2;
            const maximum =
              boundary === "start" ? range.end - 2 : section.end_time;
            return (
              <div key={boundary}>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor={`learning-${boundary}`}
                    className="font-josefin text-[8px] uppercase tracking-[0.13em] text-text-muted"
                  >
                    {boundary}
                  </label>
                  <span className="font-josefin text-[10px] text-gold">
                    {formatPreciseTime(value)}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-[36px_1fr_36px] items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onBoundaryChange(boundary, value - 0.5)}
                    className="h-9 cursor-pointer rounded-[2px] border border-border-dark bg-transparent font-josefin text-[10px] text-text-muted"
                    aria-label={`Move ${boundary} back half a second`}
                  >
                    −.5
                  </button>
                  <input
                    id={`learning-${boundary}`}
                    type="range"
                    min={minimum}
                    max={maximum}
                    step="0.1"
                    value={value}
                    onChange={(event) =>
                      onBoundaryChange(boundary, Number(event.target.value))
                    }
                    onPointerUp={onBoundaryCommit}
                    onKeyUp={onBoundaryCommit}
                    onBlur={onBoundaryCommit}
                    className="h-9 w-full cursor-pointer accent-gold"
                  />
                  <button
                    type="button"
                    onClick={() => onBoundaryChange(boundary, value + 0.5)}
                    className="h-9 cursor-pointer rounded-[2px] border border-border-dark bg-transparent font-josefin text-[10px] text-text-muted"
                    aria-label={`Move ${boundary} forward half a second`}
                  >
                    +.5
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-3 border-t border-border-dark pt-3 text-right font-josefin text-[8px] text-text-dark">
          {(range.end - range.start).toFixed(1)} seconds selected
        </p>
      </details>
    </div>
  );
}
