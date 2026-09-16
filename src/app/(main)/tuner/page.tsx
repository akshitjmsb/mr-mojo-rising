"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import StringRow from "./_components/StringRow";
import TuningGauge from "./_components/TuningGauge";
import TuningPicker from "./_components/TuningPicker";
import { usePitchDetection } from "./_hooks/usePitchDetection";
import {
  TUNINGS,
  centsBetween,
  detectedNote,
  tuningAtReference,
  midiToFrequency,
  validReferenceA,
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
    return (
      TUNINGS.find((candidate) => candidate.id === requested) ?? TUNINGS[0]
    );
  });
  const [pinned, setPinned] = useState<number | null>(null);
  const [referenceA, setReferenceA] = useState(440);
  const [customReference, setCustomReference] = useState(false);
  const [referenceDraft, setReferenceDraft] = useState("440.00");
  const targets = useMemo(() => tuningAtReference(tuning, referenceA), [tuning, referenceA]);
  const { reading, running, starting, error, start, stop } = usePitchDetection({
    minFrequency:
      Math.min(...tuning.strings.map((string) => midiToFrequency(string.midi, 415))) * 0.75,
    maxFrequency: midiToFrequency(88, 466) * 1.05,
    minClarity: 0.85,
    silenceRms: 0.0015,
  });

  const heard = detectedNote(reading.frequency ?? 0, referenceA);
  const match = useMemo(() => {
    if (reading.frequency === null) return null;
    if (pinned !== null) {
      const string = targets.strings[pinned];
      if (!string) return null;
      return {
        string,
        cents: centsBetween(reading.frequency, string.frequency),
        index: pinned,
      };
    }
    const note = detectedNote(reading.frequency, referenceA);
    if (!note) return null;
    return { string: note, cents: note.cents, index: targets.strings.findIndex(string => string.midi === note.midi) };
  }, [reading.frequency, targets, pinned, referenceA]);

  const cents = match?.cents ?? null;
  const usableCents =
    reading.stable && cents !== null && Math.abs(cents) <= 700 ? cents : null;
  const inTune =
    running &&
    reading.stable &&
    cents !== null &&
    Math.abs(cents) <= IN_TUNE_CENTS;
  const idleTarget = pinned === null ? null : targets.strings[pinned];
  const activeIndex = reading.stable ? (match?.index ?? null) : pinned;
  const noteLabel =
    heard?.name ?? "—";

  let status = "Tap start, then pluck one string";
  if (starting) status = "Starting microphone…";
  else if (running && reading.issue === "interrupted")
    status = "Microphone interrupted · tap reconnect";
  else if (running && reading.issue === "clipping")
    status = "Too loud · move the phone away";
  else if (running && reading.issue === "noisy")
    status = "Mute other strings · pluck one string";
  else if (running && reading.frequency === null)
    status = "Listening · pluck one string";
  else if (running && reading.issue === "quiet")
    status = "Pluck again · move the phone closer";
  else if (running && !reading.stable) status = "Hold the note steady";
  else if (running && match === null)
    status = "Tap the string you want to tune";
  else if (cents !== null && Math.abs(cents) > 700)
    status = "Different octave · check the string";
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
      </header>

      <div className="flex shrink-0 items-center justify-between gap-2 font-josefin text-[12px]">
        <span>Reference: A4 = {referenceA.toFixed(2)} Hz</span>
        <select aria-label="Reference pitch" value={customReference ? "custom" : String(referenceA)}
          onChange={event => {
            const value = event.target.value;
            setCustomReference(value === "custom");
            if (value !== "custom") { setReferenceA(Number(value)); setReferenceDraft(Number(value).toFixed(2)); }
          }} className="min-h-11 rounded border border-border bg-bg px-2 text-gold">
          <option value="440">440 Hz</option><option value="432">432 Hz</option><option value="custom">Custom</option>
        </select>
      </div>
      {customReference ? <label className="flex items-center justify-between gap-2 font-josefin text-[12px]">
        A4 · 415–466 Hz
        <input aria-label="Custom A4 reference in Hz" type="number" min="415" max="466" step="0.01" value={referenceDraft}
          aria-invalid={!validReferenceA(Number(referenceDraft))}
          onChange={event => { setReferenceDraft(event.target.value); const value = Number(event.target.value); if (validReferenceA(value)) setReferenceA(value); }}
          onBlur={() => setReferenceDraft(referenceA.toFixed(2))}
          className="min-h-11 w-28 rounded border border-border bg-bg px-2 text-gold" />
      </label> : null}

      <TuningPicker selected={tuning} onChange={changeTuning} />

      <section
        aria-label="Current tuning reading"
        className="flex flex-col items-center gap-1"
      >
        <div aria-label="Detected frequency" data-detected-hz={reading.frequency ?? ""} className="flex min-h-[52px] items-baseline gap-2 tabular-nums">
          <span
            className={`font-playfair text-[48px] font-black italic leading-none transition-colors ${
              inTune ? "text-gold" : "text-text"
            }`}
          >
            {reading.frequency !== null ? reading.frequency.toFixed(1) : "—"}
          </span>
          <span className="font-josefin text-[15px] text-text-muted">
            Hz
          </span>
        </div>
        <p className="font-josefin text-[12px] tabular-nums text-text-muted">
          {noteLabel}{" · "}Target: {(match?.string.frequency ?? idleTarget?.frequency)?.toFixed(2) ?? "—"} Hz
        </p>
        {pinned !== null ? <p className="font-josefin text-[10px] text-text-muted">Pinned target: {idleTarget?.name}</p> : null}
        <p
          aria-live="polite"
          className={`min-h-4 font-josefin text-[9px] uppercase tracking-[0.16em] ${
            inTune ? "text-gold" : "text-text-muted"
          }`}
        >
          {status}
          {reading.stable && cents !== null ? (
            <span> · {cents > 0 ? "+" : ""}{cents.toFixed(1)} cents</span>
          ) : (
            ""
          )}
        </p>
      </section>

      <TuningGauge cents={usableCents} inTune={inTune} />

      <div className="flex flex-col gap-2">
        <StringRow
          tuning={targets}
          activeIndex={activeIndex}
          cents={usableCents}
          pinnedIndex={pinned}
          onSelect={setPinned}
        />
        <p className="text-center font-josefin text-[8px] tracking-[0.08em] text-text-darkest">
          Auto identifies any note · tap a string to lock its target
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          if (running && reading.issue === "interrupted") {
            stop();
            void start();
          } else if (running || starting) stop();
          else void start();
        }}
        className="min-h-12 w-full cursor-pointer border border-gold bg-transparent px-5 font-josefin text-[10px] uppercase tracking-[0.18em] text-gold transition-opacity disabled:cursor-wait disabled:opacity-60"
      >
        {starting
          ? "Cancel microphone"
          : running && reading.issue === "interrupted"
            ? "Reconnect microphone"
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
