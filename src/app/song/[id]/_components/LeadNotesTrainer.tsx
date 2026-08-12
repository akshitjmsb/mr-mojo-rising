"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TabNote } from "@/lib/database.types";
import type { LearningRange } from "@/lib/learning-range";
import SoloPhraseTab from "./SoloPhraseTab";

type AudioSource = "guitar" | "backing" | "full";

interface Props {
  mode: "notes" | "play";
  notes: TabNote[];
  selection: LearningRange;
  strings: readonly string[];
  bpm: number | null;
  currentTime: number;
  currentSpeed: number;
  currentAudioSource:
    | "guitar"
    | "bass"
    | "vocals"
    | "drums"
    | "backing"
    | "full";
  isPlaying: boolean;
  loopStart: number;
  loopEnd: number;
  hasBackingTrack: boolean;
  onPractice: (
    range: LearningRange,
    speed: number,
    source?: AudioSource,
  ) => void;
  onReplay: (
    range: LearningRange,
    speed: number,
    source?: AudioSource,
  ) => void;
  onSeek: (time: number) => void;
  onPause: () => void;
}

function formatTime(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remainder = Math.floor(Math.max(0, seconds) % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export default function LeadNotesTrainer({
  mode,
  notes,
  selection,
  strings,
  bpm,
  currentTime,
  currentSpeed,
  currentAudioSource,
  isPlaying,
  loopStart,
  loopEnd,
  hasBackingTrack,
  onPractice,
  onReplay,
  onSeek,
  onPause,
}: Props) {
  const selectionNotes = useMemo(
    () =>
      notes.filter(
        (note) =>
          note.start_time >= selection.start &&
          note.start_time < selection.end,
      ),
    [notes, selection.end, selection.start],
  );
  const [countIn, setCountIn] = useState<number | null>(null);
  const countInTimersRef = useRef<number[]>([]);
  const countInAudioRef = useRef<AudioContext | null>(null);
  const currentSelectionPlaying =
    isPlaying &&
    Math.abs(loopStart - selection.start) < 0.05 &&
    Math.abs(loopEnd - selection.end) < 0.05;

  function sourcePlaying(source: AudioSource) {
    return (
      currentSelectionPlaying &&
      currentAudioSource === source &&
      Math.abs(currentSpeed - 1) < 0.01
    );
  }

  useEffect(
    () => () => {
      for (const timer of countInTimersRef.current) window.clearTimeout(timer);
      void countInAudioRef.current?.close();
    },
    [],
  );

  function cancelCountIn() {
    for (const timer of countInTimersRef.current) window.clearTimeout(timer);
    countInTimersRef.current = [];
    void countInAudioRef.current?.close();
    countInAudioRef.current = null;
    setCountIn(null);
  }

  function toggleSource(source: AudioSource) {
    cancelCountIn();
    if (sourcePlaying(source)) {
      onPractice(selection, 1, source);
    } else {
      onReplay(selection, 1, source);
    }
  }

  function scheduleCountInClick(
    context: AudioContext,
    time: number,
    accent: boolean,
  ) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.value = accent ? 1200 : 900;
    gain.gain.setValueAtTime(accent ? 0.45 : 0.28, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    oscillator.start(time);
    oscillator.stop(time + 0.06);
  }

  function playWithCountIn() {
    if (!hasBackingTrack) return;
    if (sourcePlaying("backing")) {
      onPractice(selection, 1, "backing");
      return;
    }
    cancelCountIn();
    onPause();
    const beatMs = 60_000 / Math.max(40, bpm ?? 120);
    const context = new AudioContext();
    countInAudioRef.current = context;
    void context.resume();
    setCountIn(4);

    for (let beat = 0; beat < 4; beat += 1) {
      scheduleCountInClick(context, context.currentTime + beat * (beatMs / 1000), beat === 0);
      const timer = window.setTimeout(() => setCountIn(4 - beat), beat * beatMs);
      countInTimersRef.current.push(timer);
    }
    const startTimer = window.setTimeout(() => {
      setCountIn(null);
      void context.close();
      countInAudioRef.current = null;
      countInTimersRef.current = [];
      onReplay(selection, 1, "backing");
    }, beatMs * 4);
    countInTimersRef.current.push(startTimer);
  }

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-josefin text-[8px] uppercase tracking-[0.14em] text-gold">
            Entire selected part
          </p>
        </div>
        <p className="font-josefin text-[8px] text-text-dark">
          {selectionNotes.length} {selectionNotes.length === 1 ? "note" : "notes"} · {formatTime(selection.start)}–{formatTime(selection.end)}
        </p>
      </div>

      {mode === "notes" ? (
        <>
          <section className="mt-3 rounded-[2px] border border-gold/35 bg-gold/[0.04] p-3">
            <button
              type="button"
              onClick={() => toggleSource("guitar")}
              aria-pressed={sourcePlaying("guitar")}
              className="mt-2 min-h-11 w-full cursor-pointer rounded-[2px] border border-gold bg-gold/10 px-3 font-josefin text-[9px] uppercase tracking-[0.13em] text-gold"
            >
              {sourcePlaying("guitar")
                ? "Pause"
                : "Play selected part"}
            </button>
            <p className="mt-2 text-center font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark">
              Isolated guitar · original tempo
            </p>
          </section>

          <div className="mt-3">
            <SoloPhraseTab
              notes={notes}
              range={selection}
              strings={strings}
              currentTime={currentTime}
              expanded
              onSeek={onSeek}
            />
          </div>

          <p className="mt-3 text-center font-josefin text-[8px] uppercase tracking-[0.1em] text-text-dark">
            Follow the gold line from left to right
          </p>
        </>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-[2px] border border-gold/35 bg-gold/[0.04] p-2">
            <button
              type="button"
              onClick={() => toggleSource("guitar")}
              aria-pressed={sourcePlaying("guitar")}
              className="min-h-14 cursor-pointer rounded-[2px] border border-gold bg-gold/10 px-1 font-josefin text-[8px] uppercase leading-relaxed tracking-[0.08em] text-gold"
            >
              {sourcePlaying("guitar") ? "Pause" : "Isolated guitar"}
            </button>
            <button
              type="button"
              onClick={() => toggleSource("full")}
              aria-pressed={sourcePlaying("full")}
              className="min-h-14 cursor-pointer rounded-[2px] border border-border-dark bg-transparent px-1 font-josefin text-[8px] uppercase leading-relaxed tracking-[0.08em] text-text-muted"
            >
              {sourcePlaying("full") ? "Pause" : "Full song"}
            </button>
            <button
              type="button"
              onClick={playWithCountIn}
              disabled={!hasBackingTrack}
              aria-pressed={sourcePlaying("backing")}
              className="min-h-14 cursor-pointer rounded-[2px] border border-gold bg-gold/10 px-1 font-josefin text-[8px] uppercase leading-relaxed tracking-[0.08em] text-gold disabled:cursor-default disabled:opacity-35"
            >
              {countIn !== null
                ? `Count in · ${countIn}`
                : sourcePlaying("backing")
                  ? "Pause"
                  : "Play along"}
            </button>
          </div>

          <p className="mt-2 text-center font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark">
            Original tempo · play along removes the guitar
          </p>

          <div className="mt-3">
            <SoloPhraseTab
              notes={notes}
              range={selection}
              strings={strings}
              currentTime={currentTime}
              expanded
              onSeek={onSeek}
            />
          </div>

          <p className="mt-3 text-center font-josefin text-[8px] uppercase tracking-[0.1em] text-text-dark">
            Follow the gold line from left to right
          </p>
        </>
      )}
    </div>
  );
}
