"use client";

import type { Tuning } from "../_lib/tunings";

interface Props {
  tuning: Tuning;
  activeIndex: number | null;
  cents: number | null;
}

/**
 * Six-string row. The closest string lights up gold (or orange if off-pitch);
 * cents readout sits under the active string so the user sees direction at a
 * glance.
 */
export default function StringRow({ tuning, activeIndex, cents }: Props) {
  const inTune = cents !== null && Math.abs(cents) <= 5;

  return (
    <div className="flex w-full justify-between gap-1">
      {tuning.strings.map((s, i) => {
        const active = i === activeIndex;
        const tone = active
          ? inTune
            ? "border-gold text-gold"
            : "border-orange text-orange"
          : "border-border-darkest text-text-dark";
        return (
          <div
            key={`${s.midi}-${i}`}
            className={`flex flex-1 flex-col items-center gap-1 border-t pt-2 transition-colors duration-200 ${tone}`}
          >
            <span className="font-playfair text-[18px] italic leading-none">
              {s.name.replace(/\d/, "")}
            </span>
            <span className="font-josefin text-[8px] tracking-[0.18em] text-text-darkest">
              {s.name.match(/\d/)?.[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
