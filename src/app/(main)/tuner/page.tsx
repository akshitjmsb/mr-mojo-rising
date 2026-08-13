"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import StringRow from "./_components/StringRow";
import TuningGauge from "./_components/TuningGauge";
import TuningPicker from "./_components/TuningPicker";
import { usePitchDetection } from "./_hooks/usePitchDetection";
import {
  TUNINGS,
  centsToTargetFolded,
  closestString,
  type Tuning,
} from "./_lib/tunings";

const IN_TUNE_CENTS = 3;

export default function TunerPage() {
  return (
    <Suspense fallback={<TunerLoading />}>
      <Tuner />
    </Suspense>
  );
}

function TunerLoading() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-5 sm:p-6">
      <h1 className="font-playfair text-[28px] font-bold italic text-text">
        Tuner
      </h1>
    </main>
  );
}

function Tuner() {
  const searchParams = useSearchParams();
  const [tuning, setTuning] = useState<Tuning>(() => {
    const requested = searchParams.get("tuning");
    return TUNINGS.find((candidate) => candidate.id === requested) ?? TUNINGS[0];
  });
  const [pinned, setPinned] = useState<number | null>(null);
  const { reading, running, starting, error, start, stop } =
    usePitchDetection({
      minFrequency: 30,
      maxFrequency: 700,
      minClarity: 0.8,
      silenceRms: 0.006,
    });

  const match = useMemo(() => {
    if (reading.frequency === null) return null;
    if (pinned !== null) {
      const string = tuning.strings[pinned];
      if (!string) return null;
      return {
        string,
        cents: centsToTargetFolded(reading.frequency, string.frequency),
        index: pinned,
      };
    }
    return closestString(reading.frequency, tuning);
  }, [reading.frequency, tuning, pinned]);

  const cents = match?.cents ?? null;
  const inTune =
    running &&
    reading.stable &&
    cents !== null &&
    Math.abs(cents) <= IN_TUNE_CENTS;
  const idleTarget = pinned === null ? null : tuning.strings[pinned];
  const activeIndex = reading.stable ? (match?.index ?? null) : pinned;
  const noteLabel =
    (reading.stable ? match?.string.name : null) ?? idleTarget?.name ?? "—";

  let status = "Tap start, then pluck one string";
  if (starting) status = "Starting microphone…";
  else if (running && reading.frequency === null)
    status = "Listening · pluck one string";
  else if (running && !reading.stable) status = "Hold the note steady";
  else if (inTune) status = "In tune";
  else if (cents !== null && cents < 0) status = "Tune up · flat";
  else if (cents !== null) status = "Tune down · sharp";

  const changeTuning = (next: Tuning) => {
    if (running || starting) stop();
    setTuning(next);
    setPinned(null);
  };

  return (
    <main className="flex flex-1 flex-col gap-5 p-5 sm:p-6">
      <header>
        <h1 className="font-playfair text-[28px] font-bold italic leading-tight text-text">
          Tuner
        </h1>
        <p className="mt-1 font-josefin text-[11px] tracking-[0.08em] text-text-muted">
          Pluck one string. Let it ring.
        </p>
      </header>

      <TuningPicker selected={tuning} onChange={changeTuning} />

      <section
        aria-label="Current tuning reading"
        className="flex flex-col items-center gap-1"
      >
        <div className="flex min-h-[74px] items-baseline gap-2">
          <span
            className={`font-playfair text-[72px] font-black italic leading-none transition-colors ${
              inTune ? "text-gold" : "text-text"
            }`}
          >
            {noteLabel.replace(/\d/, "")}
          </span>
          <span className="font-josefin text-[15px] text-text-muted">
            {noteLabel.match(/\d/)?.[0] ?? ""}
          </span>
        </div>
        <p
          aria-live="polite"
          className={`min-h-4 font-josefin text-[9px] uppercase tracking-[0.16em] ${
            inTune ? "text-gold" : "text-text-muted"
          }`}
        >
          {status}
          {reading.stable && cents !== null && !inTune
            ? <span aria-hidden> · {Math.abs(Math.round(cents))}¢</span>
            : ""}
        </p>
      </section>

      <TuningGauge cents={reading.stable ? cents : null} inTune={inTune} />

      <div className="flex flex-col gap-2">
        <StringRow
          tuning={tuning}
          activeIndex={activeIndex}
          cents={reading.stable ? cents : null}
          pinnedIndex={pinned}
          onSelect={setPinned}
        />
        <p className="text-center font-josefin text-[8px] tracking-[0.08em] text-text-darkest">
          Auto finds the string · tap one to lock the target
        </p>
      </div>

      <button
        type="button"
        onClick={running ? stop : start}
        disabled={starting}
        className="min-h-12 w-full cursor-pointer border border-gold bg-transparent px-5 font-josefin text-[10px] uppercase tracking-[0.18em] text-gold transition-opacity disabled:cursor-wait disabled:opacity-60"
      >
        {starting
          ? "Starting microphone…"
          : running
            ? "Stop tuner"
            : "Start tuner"}
      </button>

      {error ? (
        <p
          role="alert"
          className="-mt-2 text-center font-josefin text-[10px] leading-relaxed tracking-[0.06em] text-terracotta"
        >
          {error}
        </p>
      ) : !running && !starting ? (
        <p className="-mt-2 text-center font-josefin text-[8px] tracking-[0.1em] text-text-darkest">
          Microphone audio stays on this device
        </p>
      ) : null}
    </main>
  );
}
