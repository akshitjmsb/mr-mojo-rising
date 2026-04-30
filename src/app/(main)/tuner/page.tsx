"use client";

import { useMemo, useState } from "react";
import { usePitchDetection } from "./_hooks/usePitchDetection";
import {
  TUNINGS,
  centsBetween,
  closestString,
  type Tuning,
} from "./_lib/tunings";
import TuningGauge from "./_components/TuningGauge";
import StringRow from "./_components/StringRow";
import TuningPicker from "./_components/TuningPicker";

export default function TunerPage() {
  const [tuning, setTuning] = useState<Tuning>(TUNINGS[0]);
  const [pinned, setPinned] = useState<number | null>(null);
  const { reading, running, error, start, stop } = usePitchDetection();

  // When a string is pinned, lock cent calculations to that target instead of
  // floating to the closest string.
  const match = useMemo(() => {
    if (reading.frequency === null) return null;
    if (pinned !== null) {
      const s = tuning.strings[pinned];
      return {
        string: s,
        cents: centsBetween(reading.frequency, s.frequency),
        index: pinned,
      };
    }
    return closestString(reading.frequency, tuning);
  }, [reading.frequency, tuning, pinned]);

  const cents = match?.cents ?? null;
  const inTune = cents !== null && Math.abs(cents) <= 5;
  const activeIndex = match?.index ?? null;

  const noteLabel = match?.string.name ?? "—";
  const freqLabel =
    reading.frequency !== null ? `${reading.frequency.toFixed(1)} Hz` : "—";
  const centsLabel =
    cents === null
      ? "—"
      : `${cents > 0 ? "+" : ""}${Math.round(cents)}¢`;

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <p className="font-playfair text-[28px] font-bold italic leading-[1.2] text-text">
          Tune up.
        </p>
        <p className="mt-2 font-josefin text-[12px] font-light leading-[1.7] tracking-[0.1em] text-text-muted">
          Pluck a string. We&apos;ll tell you which one and how far off.
        </p>
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-playfair text-[72px] font-black italic leading-none ${
              inTune ? "text-gold" : "text-text"
            }`}
          >
            {noteLabel.replace(/\d/, "")}
          </span>
          <span className="font-josefin text-[16px] tracking-[0.15em] text-text-muted">
            {noteLabel.match(/\d/)?.[0] ?? ""}
          </span>
        </div>
        <p
          className={`font-josefin text-[11px] uppercase tracking-[0.22em] ${
            inTune ? "text-gold" : "text-text-muted"
          }`}
        >
          {centsLabel}
          <span className="ml-3 text-text-darkest">{freqLabel}</span>
        </p>
      </div>

      <TuningGauge cents={cents} inTune={inTune} />

      <StringRow tuning={tuning} activeIndex={activeIndex} cents={cents} />

      {!running ? (
        <button
          type="button"
          onPointerDown={() => start()}
          className="w-full cursor-pointer border border-gold bg-transparent px-6 py-3.5 font-josefin text-[11px] uppercase tracking-[0.2em] text-gold transition-opacity duration-300"
        >
          Start Tuner
        </button>
      ) : (
        <button
          type="button"
          onPointerDown={() => stop()}
          className="w-full cursor-pointer border border-border bg-transparent px-6 py-3.5 font-josefin text-[11px] uppercase tracking-[0.2em] text-text-muted transition-opacity duration-300"
        >
          Stop
        </button>
      )}

      {!running && !error && (
        <p className="-mt-3 text-center font-josefin text-[10px] tracking-[0.12em] text-text-darkest">
          Safari needs a tap to access the mic.
        </p>
      )}
      {error && (
        <p className="-mt-3 text-center font-josefin text-[11px] tracking-[0.08em] text-terracotta">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <p className="font-josefin text-[9px] uppercase tracking-[0.2em] text-text-muted">
          Lock to string
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onPointerDown={() => setPinned(null)}
            className={`flex-1 cursor-pointer border px-2 py-2 font-josefin text-[10px] uppercase tracking-[0.16em] transition-colors duration-200 ${
              pinned === null
                ? "border-gold text-gold"
                : "border-border-dark text-text-muted"
            }`}
          >
            Auto
          </button>
          {tuning.strings.map((s, i) => (
            <button
              key={`${s.midi}-${i}`}
              type="button"
              onPointerDown={() => setPinned(i)}
              className={`flex-1 cursor-pointer border px-2 py-2 font-playfair text-[12px] italic transition-colors duration-200 ${
                pinned === i
                  ? "border-gold text-gold"
                  : "border-border-dark text-text-muted"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <TuningPicker
        selected={tuning}
        onChange={(t) => {
          setTuning(t);
          setPinned(null);
        }}
      />
    </main>
  );
}
