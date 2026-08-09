"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TuningGauge from "@/app/(main)/tuner/_components/TuningGauge";
import { usePitchDetection } from "@/app/(main)/tuner/_hooks/usePitchDetection";
import {
  TUNINGS,
  centsToTargetFolded,
} from "@/app/(main)/tuner/_lib/tunings";
import {
  playReferenceNote,
  stopReferenceAudio,
} from "@/lib/reference-audio";

interface Props {
  onBeforeStart: () => void;
  onComplete: () => void;
}

const EB_TUNING = TUNINGS.find((tuning) => tuning.id === "eb-standard")!;
const STABLE_MS = 700;
const IN_TUNE_CENTS = 4;

export default function InlineTuner({ onBeforeStart, onComplete }: Props) {
  const [targetIndex, setTargetIndex] = useState(0);
  const [tuned, setTuned] = useState(() =>
    EB_TUNING.strings.map(() => false),
  );
  const [holdProgress, setHoldProgress] = useState(0);
  const stableSinceRef = useRef<number | null>(null);
  const reportedCompleteRef = useRef(false);
  const { reading, running, error, start, stop } = usePitchDetection({
    minFrequency: 60,
    maxFrequency: 700,
    minClarity: 0.78,
    silenceRms: 0.009,
  });

  const target = EB_TUNING.strings[targetIndex];
  const cents = useMemo(
    () =>
      reading.frequency === null
        ? null
        : centsToTargetFolded(reading.frequency, target.frequency),
    [reading.frequency, target.frequency],
  );
  const stableSignal =
    running &&
    cents !== null &&
    Math.abs(cents) <= IN_TUNE_CENTS &&
    reading.clarity >= 0.78 &&
    reading.rms >= 0.009;
  const allTuned = tuned.every(Boolean);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!stableSignal || tuned[targetIndex]) {
        stableSinceRef.current = null;
        setHoldProgress(0);
        return;
      }

      const now = performance.now();
      if (stableSinceRef.current === null) stableSinceRef.current = now;
      const elapsed = now - stableSinceRef.current;
      setHoldProgress(Math.min(1, elapsed / STABLE_MS));

      if (elapsed < STABLE_MS) return;
      setTuned((current) =>
        current.map((value, index) =>
          index === targetIndex ? true : value,
        ),
      );
      stableSinceRef.current = null;
      setHoldProgress(0);
      const nextUntuned = tuned.findIndex(
        (value, index) => !value && index !== targetIndex,
      );
      if (nextUntuned >= 0) setTargetIndex(nextUntuned);
    });
    return () => cancelAnimationFrame(frame);
  }, [reading, stableSignal, targetIndex, tuned]);

  useEffect(() => {
    if (!allTuned || reportedCompleteRef.current) return;
    reportedCompleteRef.current = true;
    stop();
    onComplete();
  }, [allTuned, onComplete, stop]);

  function chooseString(index: number) {
    if (running) stop();
    stableSinceRef.current = null;
    setHoldProgress(0);
    setTargetIndex(index);
    setTuned((current) =>
      current.map((value, stringIndex) =>
        stringIndex === index ? false : value,
      ),
    );
    reportedCompleteRef.current = false;
    void playReferenceNote(EB_TUNING.strings[index].frequency);
  }

  function markTunedElsewhere() {
    setTuned(EB_TUNING.strings.map(() => true));
  }

  const direction =
    cents === null
      ? `Pluck the ${targetIndex === 0 ? "thickest" : targetIndex === 5 ? "thinnest" : target.name.replace(/\d/, "")} string`
      : Math.abs(cents) <= IN_TUNE_CENTS
        ? "Hold it steady"
        : cents < 0
          ? "Tune up · string is flat"
          : "Tune down · string is sharp";

  return (
    <div className="mt-3 rounded-[2px] border border-border-dark bg-bg/55 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-josefin text-[8px] uppercase tracking-[0.16em] text-text-dark">
            Built-in tuner · E♭ Standard
          </p>
          <p className="mt-1 font-josefin text-[10px] leading-relaxed text-text-muted">
            Tune thickest to thinnest. Let each note ring until it locks.
          </p>
        </div>
        <p className="shrink-0 font-josefin text-[8px] uppercase tracking-[0.1em] text-gold">
          {tuned.filter(Boolean).length} / 6
        </p>
      </div>

      <div className="mt-3 flex items-end justify-center gap-2">
        <span
          className={`font-playfair text-[48px] font-black italic leading-none ${
            stableSignal ? "text-gold" : "text-text"
          }`}
        >
          {target.name.replace(/\d/, "")}
        </span>
        <span className="pb-1 font-josefin text-[12px] text-text-muted">
          {target.name.match(/\d/)?.[0]}
        </span>
        <span className="pb-1 font-josefin text-[10px] text-text-dark">
          {cents === null
            ? "—"
            : `${cents > 0 ? "+" : ""}${Math.round(cents)}¢`}
        </span>
      </div>

      <TuningGauge cents={cents} inTune={stableSignal} />

      <p
        className={`-mt-1 text-center font-josefin text-[9px] uppercase tracking-[0.13em] ${
          stableSignal ? "text-gold" : "text-text-muted"
        }`}
      >
        {allTuned ? "All six strings are ready" : direction}
      </p>
      <div className="mx-auto mt-2 h-1 w-full overflow-hidden bg-border-darkest">
        <div
          className="h-full bg-gold transition-[width] duration-75"
          style={{ width: `${holdProgress * 100}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-6 gap-1" aria-label="E-flat tuning strings">
        {EB_TUNING.strings.map((string, index) => (
          <button
            key={`${string.midi}-${index}`}
            type="button"
            onClick={() => chooseString(index)}
            aria-pressed={targetIndex === index}
            aria-label={`Play ${string.name} reference${tuned[index] ? ", tuned" : ""}`}
            className={`min-h-11 cursor-pointer rounded-[1px] border font-playfair text-[12px] italic ${
              tuned[index]
                ? "border-gold bg-gold/10 text-gold"
                : targetIndex === index
                  ? "border-orange bg-orange/5 text-orange"
                  : "border-border-dark bg-transparent text-text-muted"
            }`}
          >
            {tuned[index] ? "✓ " : ""}
            {string.name.replace(/\d/, "")}
          </button>
        ))}
      </div>

      {!allTuned && (
        <button
          type="button"
          onPointerDown={() => {
            if (running) {
              stop();
            } else {
              stopReferenceAudio();
              onBeforeStart();
              void start();
            }
          }}
          className={`mt-3 min-h-11 w-full cursor-pointer rounded-[2px] border px-4 font-josefin text-[9px] uppercase tracking-[0.14em] ${
            running
              ? "border-border text-text-muted"
              : "border-gold bg-gold/10 text-gold"
          }`}
        >
          {running ? "Stop microphone" : "Start microphone tuner"}
        </button>
      )}

      {!running && !allTuned && !error && (
        <p className="mt-2 text-center font-josefin text-[8px] leading-relaxed tracking-[0.08em] text-text-darkest">
          Your browser will ask for microphone permission. Audio stays on this device.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-center font-josefin text-[9px] leading-relaxed text-terracotta">
          {error}
        </p>
      )}

      {!allTuned && (
        <button
          type="button"
          onClick={markTunedElsewhere}
          className="mt-2 min-h-8 w-full cursor-pointer border-none bg-transparent font-josefin text-[8px] uppercase tracking-[0.1em] text-text-dark underline underline-offset-4"
        >
          I already tuned with another tuner
        </button>
      )}
    </div>
  );
}
