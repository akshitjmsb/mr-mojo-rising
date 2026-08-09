"use client";

import { useMemo } from "react";
import type { Section, TabNote } from "@/lib/database.types";
import type { LearningRange } from "@/lib/learning-range";

interface Props {
  section: Section;
  sectionLabel: string;
  notes: TabNote[];
  range: LearningRange;
  accuracyPassed: boolean;
  showWaveform: boolean;
  readyLabel: string;
  previewPlaying: boolean;
  onChangeSection: () => void;
  onBoundaryChange: (boundary: "start" | "end", value: number) => void;
  onBoundaryCommit: () => void;
  onPreview: () => void;
}

const WAVEFORM_BINS = 42;

function formatPreciseTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = (safeSeconds % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${remainder}`;
}

export default function LearningRangePicker({
  section,
  sectionLabel,
  notes,
  range,
  accuracyPassed,
  showWaveform,
  readyLabel,
  previewPlaying,
  onChangeSection,
  onBoundaryChange,
  onBoundaryCommit,
  onPreview,
}: Props) {
  const sectionDuration = Math.max(0.1, section.end_time - section.start_time);
  const waveform = useMemo(() => {
    const bins = Array.from({ length: WAVEFORM_BINS }, () => 0);
    for (const note of notes) {
      const progress =
        (note.start_time - section.start_time) / sectionDuration;
      const index = Math.max(
        0,
        Math.min(WAVEFORM_BINS - 1, Math.floor(progress * WAVEFORM_BINS)),
      );
      bins[index] += Math.max(0.2, note.duration);
    }
    const maximum = Math.max(1, ...bins);
    return bins.map((value) => 18 + (value / maximum) * 82);
  }, [notes, section.start_time, sectionDuration]);
  const selectionLeft =
    ((range.start - section.start_time) / sectionDuration) * 100;
  const selectionWidth = ((range.end - range.start) / sectionDuration) * 100;

  return (
    <div className="rounded-[2px] border border-gold/35 bg-bg/45 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-playfair text-[19px] italic text-gold">
            {sectionLabel}
          </p>
          <p className="mt-0.5 font-josefin text-[8px] tracking-[0.08em] text-text-dark">
            {formatPreciseTime(section.start_time)}–{formatPreciseTime(section.end_time)}
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

      {showWaveform && (
        <div className="relative mt-3 flex h-14 items-center gap-[2px] overflow-hidden rounded-[2px] border border-border-dark bg-bg px-1.5" aria-label="Guitar activity waveform">
          {waveform.map((height, index) => (
            <span
              key={index}
              className="flex-1 bg-text-darkest/55"
              style={{ height: `${height}%` }}
            />
          ))}
          <span
            className="pointer-events-none absolute bottom-0 top-0 border-x border-gold bg-gold/15"
            style={{ left: `${selectionLeft}%`, width: `${selectionWidth}%` }}
          />
        </div>
      )}

      <div className="mt-3 space-y-3">
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

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-dark pt-3">
        <p className={`font-josefin text-[7px] uppercase tracking-[0.1em] ${accuracyPassed ? "text-gold" : "text-terracotta"}`}>
          {accuracyPassed ? `✓ ${readyLabel}` : "Adjusting selection…"}
        </p>
        <p className="font-josefin text-[8px] text-text-dark">
          {(range.end - range.start).toFixed(1)} sec
        </p>
      </div>

      <button
        type="button"
        onClick={accuracyPassed ? onPreview : onBoundaryCommit}
        className="mt-3 min-h-11 w-full cursor-pointer rounded-[2px] border border-gold bg-gold/10 px-4 font-josefin text-[9px] uppercase tracking-[0.14em] text-gold"
      >
        {accuracyPassed
          ? previewPlaying
            ? "Pause selection"
            : `Hear ${formatPreciseTime(range.start)}–${formatPreciseTime(range.end)}`
          : "Snap to guitar"}
      </button>
    </div>
  );
}
