"use client";

import type { Tuning } from "../_lib/tunings";

interface Props {
  tuning: Tuning;
  activeIndex: number | null;
  cents: number | null;
  pinnedIndex: number | null;
  onSelect: (index: number | null) => void;
}

/** One compact target selector; Auto identifies a stable plucked string. */
export default function StringRow({
  tuning,
  activeIndex,
  cents,
  pinnedIndex,
  onSelect,
}: Props) {
  const inTune = cents !== null && Math.abs(cents) <= 3;

  return (
    <div className="grid w-full grid-cols-[auto_1fr] gap-1">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={pinnedIndex === null}
        className={`min-h-12 cursor-pointer rounded-[1px] border px-2 font-josefin text-[7px] uppercase tracking-[0.1em] ${
          pinnedIndex === null
            ? "border-gold text-gold"
            : "border-border-dark text-text-dark"
        }`}
      >
        Auto
      </button>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${tuning.strings.length}, minmax(0, 1fr))` }}
      >
        {tuning.strings.map((string, index) => {
          const active = index === activeIndex;
          const pinned = index === pinnedIndex;
          const tone = active
            ? inTune
              ? "border-gold bg-gold/[0.07] text-gold"
              : "border-orange bg-orange/[0.04] text-orange"
            : pinned
              ? "border-gold/60 text-gold"
              : "border-border-dark text-text-dark";
          return (
            <button
              key={`${string.midi}-${index}`}
              type="button"
              onClick={() => onSelect(index)}
              aria-pressed={pinned}
              aria-label={`Target ${string.name} string`}
              className={`flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[1px] border transition-colors duration-150 ${tone}`}
            >
              <span className="font-playfair text-[16px] italic leading-none">
                {string.name.replace(/\d/, "")}
              </span>
              <span className="font-josefin text-[7px] text-text-darkest">
                {string.name.match(/\d/)?.[0]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
