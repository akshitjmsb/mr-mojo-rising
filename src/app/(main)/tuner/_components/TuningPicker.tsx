"use client";

import { TUNINGS, type Tuning } from "../_lib/tunings";

interface Props {
  selected: Tuning;
  onChange: (tuning: Tuning) => void;
}

export default function TuningPicker({ selected, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-josefin text-[9px] uppercase tracking-[0.2em] text-text-muted">
        Tuning
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {TUNINGS.map((t) => {
          const active = t.id === selected.id;
          return (
            <button
              key={t.id}
              type="button"
              onPointerDown={() => onChange(t)}
              className={`flex flex-col items-start gap-0.5 border px-3 py-2 text-left transition-colors duration-200 ${
                active
                  ? "border-gold bg-gold/5 text-gold"
                  : "border-border-dark bg-transparent text-text-muted"
              }`}
            >
              <span className="font-josefin text-[10px] uppercase tracking-[0.18em]">
                {t.label}
              </span>
              <span className="font-josefin text-[10px] tracking-[0.12em] text-text-darkest">
                {t.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
