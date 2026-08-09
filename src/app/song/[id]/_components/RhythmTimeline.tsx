"use client";

import { useMemo } from "react";
import type { TabNote } from "@/lib/database.types";
import { buildRhythmAttacks } from "@/lib/rhythm-attacks";

interface Props {
  notes: TabNote[];
  start: number;
  end: number;
  currentTime: number;
  active: boolean;
}

export default function RhythmTimeline({
  notes,
  start,
  end,
  currentTime,
  active,
}: Props) {
  const attacks = useMemo(
    () => buildRhythmAttacks(notes, start, end),
    [end, notes, start],
  );
  const duration = Math.max(0.1, end - start);
  const playhead = Math.max(0, Math.min(1, (currentTime - start) / duration));
  const latestAttack = active
    ? attacks.findLastIndex((attack) => attack.time <= currentTime)
    : -1;

  return (
    <div
      className="relative h-28 overflow-hidden border-y border-border-dark"
      role="img"
      aria-label={`${attacks.length} guitar attacks in this phrase`}
    >
      <span className="absolute inset-x-0 top-1/2 h-px bg-border-dark" />
      {attacks.map((attack, index) => {
        const left = ((attack.time - start) / duration) * 100;
        const highlighted =
          index === latestAttack && currentTime - attack.time <= 0.22;
        return (
          <span
            key={`${attack.time}-${index}`}
            aria-hidden="true"
            className={`absolute bottom-1/2 w-[3px] -translate-x-1/2 rounded-t-full transition-colors duration-75 ${
              highlighted ? "bg-gold" : "bg-text-dark"
            }`}
            style={{
              left: `${left}%`,
              height: `${Math.round(22 + attack.strength * 52)}px`,
            }}
          />
        );
      })}
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-y-3 w-px bg-gold/70"
          style={{ left: `${playhead * 100}%` }}
        />
      )}
    </div>
  );
}
