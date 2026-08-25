"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildListenMatchPhrase,
  evaluateRhythmTake,
  type RhythmTakeResult,
} from "@/lib/listen-match";
import type { RhythmChordChange } from "@/lib/rhythm-chords";
import { useRhythmCapture } from "../_hooks/useRhythmCapture";

type PracticeRange = { start: number; end: number };
type Phase =
  | "idle"
  | "permission"
  | "listening"
  | "counting"
  | "recording"
  | "result";

interface Props {
  changes: RhythmChordChange[];
  selection: PracticeRange;
  bpm: number | null;
  tuningOffset: number;
  onReplay: (range: PracticeRange, speed: number, source: "guitar") => void;
  onPause: () => void;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export default function ListenAndMatch({
  changes,
  selection,
  bpm,
  tuningOffset,
  onReplay,
  onPause,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(4);
  const [result, setResult] = useState<RhythmTakeResult | null>(null);
  const sessionRef = useRef(0);
  const {
    starting,
    error,
    start,
    stop,
    beginCapture,
    finishCapture,
  } = useRhythmCapture();
  const phrase = useMemo(
    () => buildListenMatchPhrase(changes, selection),
    [changes, selection],
  );
  const busy = !["idle", "result"].includes(phase);

  useEffect(() => {
    return () => {
      sessionRef.current += 1;
      stop();
    };
  }, [stop]);

  async function begin() {
    if (!phrase || busy) return;
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    setResult(null);
    setPhase("permission");
    onPause();

    const microphoneReady = await start();
    if (!microphoneReady || sessionRef.current !== session) {
      setPhase("idle");
      return;
    }

    const durationMs = (phrase.end - phrase.start) * 1000;
    setPhase("listening");
    onReplay(phrase, 1, "guitar");
    await wait(durationMs);
    if (sessionRef.current !== session) return;

    onPause();
    setPhase("counting");
    const beatMs = Math.min(900, Math.max(350, 60_000 / (bpm ?? 100)));
    for (let nextCount = 4; nextCount >= 1; nextCount--) {
      setCount(nextCount);
      await wait(beatMs);
      if (sessionRef.current !== session) return;
    }

    beginCapture();
    setPhase("recording");
    await wait(durationMs);
    if (sessionRef.current !== session) return;

    const frames = finishCapture();
    stop();
    setResult(evaluateRhythmTake(phrase, frames, tuningOffset));
    setPhase("result");
  }

  function cancel() {
    sessionRef.current += 1;
    onPause();
    stop();
    setPhase("idle");
    setResult(null);
  }

  if (!phrase) return null;

  const status =
    phase === "permission"
      ? "Allow microphone"
      : phase === "listening"
        ? "Listen"
        : phase === "counting"
          ? `${count}`
          : phase === "recording"
            ? "Play now"
            : null;

  return (
    <div className="mt-5 border-t border-border-dark pt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-playfair text-[18px] italic text-text">
            Listen &amp; Match
          </p>
          <p className="mt-1 font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark">
            Headphones · on-device · verified chords
          </p>
        </div>
        <p className="shrink-0 font-josefin text-[9px] tracking-[0.08em] text-gold">
          {phrase.changes.map((change) => change.label).join(" → ")}
        </p>
      </div>

      {status ? (
        <div
          className="mt-4 flex min-h-20 items-center justify-center rounded-[2px] border border-gold/45 bg-gold/[0.06] font-playfair text-[25px] italic text-gold"
          role="status"
          aria-live="polite"
        >
          {status}
        </div>
      ) : result ? (
        <div
          className={`mt-4 rounded-[2px] border px-4 py-4 ${
            result.outcome === "passed"
              ? "border-gold bg-gold/[0.08]"
              : "border-border-dark bg-bg/30"
          }`}
          role="status"
          aria-live="polite"
        >
          <p
            className={`font-playfair text-[17px] italic leading-snug ${
              result.outcome === "passed" ? "text-gold" : "text-text"
            }`}
          >
            {result.message}
          </p>
        </div>
      ) : error ? (
        <p className="mt-4 font-josefin text-[9px] leading-relaxed text-orange">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void begin()}
        disabled={busy || starting}
        className="mt-3 min-h-12 w-full cursor-pointer rounded-[2px] border border-gold bg-gold/10 px-4 font-josefin text-[9px] uppercase tracking-[0.14em] text-gold disabled:cursor-default disabled:opacity-45"
      >
        {result ? "Try again" : "Start listen & match"}
      </button>
      {busy ? (
        <button
          type="button"
          onClick={cancel}
          className="mt-2 min-h-9 w-full font-josefin text-[7px] uppercase tracking-[0.12em] text-text-dark"
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}
