"use client";

import { useEffect, useMemo, useRef } from "react";
import type { TabNote } from "@/lib/database.types";
import type { PracticePhrase } from "@/lib/solo-phrases";

interface Props {
  notes: TabNote[];
  range: PracticePhrase;
  strings: readonly string[];
  currentTime: number;
  expanded?: boolean;
  onSeek: (time: number) => void;
}

const LANE_HEIGHT = 23;
const PAD_TOP = 10;
const LABEL_WIDTH = 24;
const MIN_NOTE_WIDTH = 16;

type TabNoteWithTechnique = TabNote & {
  slideTo: number | null;
  slideDirection: "/" | "\\" | null;
};

function annotateTechniques(notes: TabNote[]): TabNoteWithTechnique[] {
  return notes.map((note, index) => {
    const next = notes[index + 1];
    const possibleSlide =
      next &&
      next.string_num === note.string_num &&
      next.fret !== note.fret &&
      next.start_time > note.start_time &&
      next.start_time <= note.start_time + Math.max(note.duration, 0.1) + 0.3;
    return {
      ...note,
      slideTo: possibleSlide ? next.fret : null,
      slideDirection: possibleSlide
        ? next.fret > note.fret
          ? "/"
          : "\\"
        : null,
    };
  });
}

export default function SoloPhraseTab({
  notes,
  range,
  strings,
  currentTime,
  expanded = false,
  onSeek,
}: Props) {
  const duration = Math.max(0.5, range.end - range.start);
  const phraseNotes = useMemo(
    () =>
      annotateTechniques(
        notes.filter(
          (note) =>
            note.start_time >= range.start && note.start_time < range.end,
        ),
      ),
    [notes, range.end, range.start],
  );
  const contentWidth = expanded ? Math.max(640, duration * 58) : "100%";
  const height = PAD_TOP * 2 + LANE_HEIGHT * 6;
  const stringLabels = [...strings].reverse();
  const playheadPercent =
    ((currentTime - range.start) / duration) * 100;
  const showPlayhead = currentTime >= range.start && currentTime <= range.end;
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!expanded || !showPlayhead || !scrollerRef.current) return;
    const scroller = scrollerRef.current;
    const progress = Math.max(0, Math.min(1, playheadPercent / 100));
    const target = progress * scroller.scrollWidth - scroller.clientWidth * 0.42;
    scroller.scrollLeft = Math.max(
      0,
      Math.min(scroller.scrollWidth - scroller.clientWidth, target),
    );
  }, [expanded, playheadPercent, showPlayhead]);

  return (
    <div>
      <div className="flex overflow-hidden rounded-[2px] border border-border-dark bg-bg/55">
        <div
          className="relative z-20 shrink-0 border-r border-border-dark bg-bg"
          style={{ width: LABEL_WIDTH, height }}
          aria-hidden="true"
        >
          {stringLabels.map((label, index) => (
            <span
              key={`${label}-${index}`}
              className="absolute left-1.5 font-josefin text-[8px] leading-none text-text-dark"
              style={{ top: PAD_TOP + index * LANE_HEIGHT + LANE_HEIGHT / 2 - 4 }}
            >
              {label}
            </span>
          ))}
        </div>

        <div
          ref={scrollerRef}
          className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:thin]"
        >
          <div
            className="relative select-none"
            role="group"
            aria-label={expanded ? "Entire solo tablature" : "Current solo phrase tablature"}
            style={{ width: contentWidth, height }}
          >
            {stringLabels.map((label, index) => {
              const y = PAD_TOP + index * LANE_HEIGHT + LANE_HEIGHT / 2;
              return (
                <div
                  key={`${label}-line-${index}`}
                  className="absolute left-0 right-0 border-t border-border-darkest"
                  style={{ top: y }}
                />
              );
            })}

            {phraseNotes.map((note) => {
              const left = ((note.start_time - range.start) / duration) * 100;
              const sustainWidth = Math.max(
                0,
                (note.duration / duration) * 100,
              );
              const y =
                PAD_TOP +
                (note.string_num - 1) * LANE_HEIGHT +
                LANE_HEIGHT / 2;
              const active =
                currentTime >= note.start_time &&
                currentTime <= note.start_time + Math.max(note.duration, 0.12);
              return (
                <div key={note.id}>
                  {sustainWidth > 1.2 && (
                    <div
                      className={`absolute h-px ${active ? "bg-gold/70" : "bg-text-darkest/60"}`}
                      style={{ left: `${left}%`, top: y, width: `${sustainWidth}%` }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onSeek(note.start_time)}
                    aria-label={`String ${note.string_num}, fret ${note.fret}, at ${note.start_time.toFixed(1)} seconds`}
                    className={`absolute z-10 flex h-[18px] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[1px] border-none bg-bg px-0.5 font-josefin leading-none ${
                      active
                        ? "text-[13px] font-normal text-gold"
                        : "text-[11px] font-light text-text-muted"
                    }`}
                    style={{ left: `${left}%`, top: y, minWidth: MIN_NOTE_WIDTH }}
                  >
                    {note.fret}
                  </button>
                  {note.slideDirection && note.slideTo !== null && (
                    <span
                      className="pointer-events-none absolute z-10 -translate-y-1/2 font-josefin text-[10px] text-gold/80"
                      style={{
                        left: `calc(${left}% + 9px)`,
                        top: y,
                      }}
                      aria-hidden="true"
                    >
                      {note.slideDirection}
                    </span>
                  )}
                </div>
              );
            })}

            {showPlayhead && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-gold shadow-[0_0_5px_var(--color-gold)]"
                style={{ left: `${playheadPercent}%` }}
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex items-start justify-between gap-3 font-josefin text-[7px] uppercase leading-relaxed tracking-[0.09em] text-text-darkest">
        <span>Top line = thinnest string · tap a fret to jump</span>
        <span className="shrink-0">/ or \ = possible slide</span>
      </div>
    </div>
  );
}
