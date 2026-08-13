"use client";

import { TUNINGS, type Tuning } from "../_lib/tunings";

interface Props {
  selected: Tuning;
  onChange: (tuning: Tuning) => void;
}

export default function TuningPicker({ selected, onChange }: Props) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-4 border-b border-border-dark pb-3">
      <span className="font-josefin text-[8px] uppercase tracking-[0.14em] text-text-dark">
        Tuning
      </span>
      <select
        value={selected.id}
        onChange={(event) => {
          const tuning = TUNINGS.find((item) => item.id === event.target.value);
          if (tuning) onChange(tuning);
        }}
        className="min-h-9 max-w-[72%] rounded-[2px] border border-border bg-bg px-2 font-josefin text-[9px] text-gold"
      >
        {TUNINGS.map((tuning) => (
          <option key={tuning.id} value={tuning.id}>
            {tuning.label} · {tuning.description}
          </option>
        ))}
      </select>
    </label>
  );
}
