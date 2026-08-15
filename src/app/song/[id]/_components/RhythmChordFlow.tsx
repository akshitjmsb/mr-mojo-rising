"use client";

import { useEffect, useRef } from "react";
import type { RhythmChordChange } from "@/lib/rhythm-chords";

interface Props {
  changes: RhythmChordChange[];
  start: number;
  end: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

const PIXELS_PER_SECOND = 48;

export default function RhythmChordFlow({
  changes,
  start,
  end,
  currentTime,
  onSeek,
}: Props) {
  const duration = Math.max(0.5, end - start);
  const contentWidth = Math.max(640, duration * PIXELS_PER_SECOND);
  const playheadPercent = ((currentTime - start) / duration) * 100;
  const showPlayhead = currentTime >= start && currentTime <= end;
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showPlayhead || !scrollerRef.current) return;
    const scroller = scrollerRef.current;
    const progress = Math.max(0, Math.min(1, playheadPercent / 100));
    const target = progress * scroller.scrollWidth - scroller.clientWidth * 0.38;
    scroller.scrollLeft = Math.max(
      0,
      Math.min(scroller.scrollWidth - scroller.clientWidth, target),
    );
  }, [playheadPercent, showPlayhead]);

  if (changes.length === 0) {
    return (
      <p className="mt-4 border-y border-border-dark py-5 text-center font-josefin text-[9px] text-text-muted">
        No clear chord was detected in this selection.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="mb-2 font-josefin text-[8px] uppercase tracking-[0.12em] text-text-dark">
        Best detected chord flow · brighter means stronger
      </p>
      <div
        ref={scrollerRef}
        className="overflow-x-auto rounded-[2px] border border-border-dark bg-bg/55 [scrollbar-width:thin]"
      >
        <div
          className="relative h-24 select-none"
          style={{ width: contentWidth }}
          role="group"
          aria-label="Chord changes flowing from left to right"
        >
          <div className="absolute left-0 right-0 top-1/2 border-t border-border-darkest" />

          {changes.map((change) => {
            const left = ((change.start - start) / duration) * 100;
            const width = ((change.end - change.start) / duration) * 100;
            const active =
              currentTime >= change.start && currentTime < change.end;

            return (
              <button
                key={change.id}
                type="button"
                onClick={() => onSeek(change.start)}
                aria-label={`${change.label} at ${change.start.toFixed(1)} seconds`}
                className={`absolute inset-y-0 overflow-hidden border-r px-3 text-left transition-colors ${
                  change.verified ? "border-border-dark" : "border-border-darkest"
                } ${
                  active
                    ? "bg-gold/10 text-gold"
                    : change.verified
                      ? "bg-transparent text-text-muted"
                      : "bg-transparent text-text-dark"
                }`}
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                <span className="block whitespace-nowrap font-playfair text-[24px] italic leading-none">
                  {change.label}
                </span>
                {!change.verified ? (
                  <span className="mt-1 block font-josefin text-[6px] uppercase tracking-[0.08em] text-text-darkest">
                    Best guess
                  </span>
                ) : null}
              </button>
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
  );
}
