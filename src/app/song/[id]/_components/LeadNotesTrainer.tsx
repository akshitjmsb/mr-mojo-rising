"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TabNote } from "@/lib/database.types";
import {
  buildLearningRangeSuggestions,
  type LearningRange,
} from "@/lib/learning-range";
import SoloPhraseTab from "./SoloPhraseTab";

type AudioSource = "guitar" | "backing" | "full";
type PracticeSpeed = 0.5 | 0.65 | 0.8 | 1;

interface Props {
  notes: TabNote[];
  selection: LearningRange;
  strings: readonly string[];
  bpm: number | null;
  currentTime: number;
  currentSpeed: number;
  currentAudioSource: "guitar" | "bass" | "backing" | "full";
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

const SPEEDS: Array<{ value: PracticeSpeed; label: string }> = [
  { value: 0.5, label: "50%" },
  { value: 0.65, label: "65%" },
  { value: 0.8, label: "80%" },
  { value: 1, label: "100%" },
];

function formatTime(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remainder = (Math.max(0, seconds) % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${remainder}`;
}

export default function LeadNotesTrainer({
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
  const windows = useMemo(
    () =>
      buildLearningRangeSuggestions(
        notes,
        selection.start,
        selection.end,
        bpm,
      ),
    [bpm, notes, selection.end, selection.start],
  );
  const [windowIndex, setWindowIndex] = useState(0);
  const [practiceSpeed, setPracticeSpeed] = useState<PracticeSpeed>(0.65);
  const [countIn, setCountIn] = useState<number | null>(null);
  const countInTimersRef = useRef<number[]>([]);
  const countInAudioRef = useRef<AudioContext | null>(null);
  const boundedIndex = Math.min(windowIndex, Math.max(0, windows.length - 1));
  const playingIndex = isPlaying
    ? windows.findIndex(
        (range) => currentTime >= range.start && currentTime < range.end,
      )
    : -1;
  const safeIndex = playingIndex >= 0 ? playingIndex : boundedIndex;
  const activeWindow = windows[safeIndex] ?? selection;
  const currentWindowPlaying =
    isPlaying &&
    Math.abs(loopStart - activeWindow.start) < 0.05 &&
    Math.abs(loopEnd - activeWindow.end) < 0.05;

  function sourcePlaying(source: AudioSource) {
    return (
      currentWindowPlaying &&
      currentAudioSource === source &&
      Math.abs(currentSpeed - practiceSpeed) < 0.01
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

  function changeWindow(nextIndex: number) {
    cancelCountIn();
    const clampedIndex = Math.max(0, Math.min(windows.length - 1, nextIndex));
    const nextWindow = windows[clampedIndex];
    if (!nextWindow) return;
    setWindowIndex(clampedIndex);
    if (isPlaying) {
      const source: AudioSource =
        currentAudioSource === "backing" || currentAudioSource === "full"
          ? currentAudioSource
          : "guitar";
      onReplay(nextWindow, practiceSpeed, source);
    } else {
      onSeek(nextWindow.start);
    }
  }

  function toggleSource(source: AudioSource) {
    cancelCountIn();
    if (sourcePlaying(source)) {
      onPractice(activeWindow, practiceSpeed, source);
    } else {
      onReplay(activeWindow, practiceSpeed, source);
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
      onPractice(activeWindow, practiceSpeed, "backing");
      return;
    }
    cancelCountIn();
    onPause();
    const beatMs = 60_000 / Math.max(40, (bpm ?? 120) * practiceSpeed);
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
      onReplay(activeWindow, practiceSpeed, "backing");
    }, beatMs * 4);
    countInTimersRef.current.push(startTimer);
  }

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-josefin text-[8px] uppercase tracking-[0.14em] text-gold">
            Window {safeIndex + 1} of {windows.length || 1}
          </p>
          <p className="mt-1 font-josefin text-[9px] text-text-dark">
            {formatTime(activeWindow.start)}–{formatTime(activeWindow.end)}
          </p>
        </div>
        <p className="font-josefin text-[8px] text-text-dark">
          {(activeWindow.end - activeWindow.start).toFixed(1)} sec
        </p>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_2fr_1fr] gap-2">
        <button
          type="button"
          onClick={() => changeWindow(safeIndex - 1)}
          disabled={safeIndex === 0}
          className="min-h-10 cursor-pointer rounded-[2px] border border-border-dark bg-transparent font-josefin text-[8px] uppercase tracking-[0.1em] text-text-muted disabled:cursor-default disabled:opacity-30"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onSeek(activeWindow.start)}
          className="min-h-10 cursor-pointer rounded-[2px] border border-gold/35 bg-gold/[0.04] font-josefin text-[8px] uppercase tracking-[0.1em] text-gold"
        >
          Start this window
        </button>
        <button
          type="button"
          onClick={() => changeWindow(safeIndex + 1)}
          disabled={safeIndex >= windows.length - 1}
          className="min-h-10 cursor-pointer rounded-[2px] border border-border-dark bg-transparent font-josefin text-[8px] uppercase tracking-[0.1em] text-text-muted disabled:cursor-default disabled:opacity-30"
        >
          Next
        </button>
      </div>

      <div className="mt-3">
        <SoloPhraseTab
          notes={notes}
          range={activeWindow}
          strings={strings}
          currentTime={currentTime}
          expanded
          onSeek={onSeek}
        />
      </div>

      <fieldset className="mt-3 border-t border-border-dark pt-3">
        <legend className="font-josefin text-[8px] uppercase tracking-[0.14em] text-text-dark">
          Practice speed
        </legend>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {SPEEDS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setPracticeSpeed(option.value);
                if (currentWindowPlaying) {
                  const source: AudioSource =
                    currentAudioSource === "backing" ||
                    currentAudioSource === "full"
                      ? currentAudioSource
                      : "guitar";
                  onReplay(activeWindow, option.value, source);
                }
              }}
              aria-pressed={practiceSpeed === option.value}
              className={`min-h-10 cursor-pointer rounded-[2px] border font-josefin text-[9px] ${
                practiceSpeed === option.value
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border-dark bg-transparent text-text-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={() => toggleSource("guitar")}
          aria-pressed={sourcePlaying("guitar")}
          className="min-h-14 cursor-pointer rounded-[2px] border border-gold/45 bg-transparent px-1 font-josefin text-[8px] uppercase leading-relaxed tracking-[0.08em] text-gold"
        >
          {sourcePlaying("guitar")
            ? "Pause"
            : "Hear guitar"}
        </button>
        <button
          type="button"
          onClick={() => toggleSource("full")}
          aria-pressed={sourcePlaying("full")}
          className="min-h-14 cursor-pointer rounded-[2px] border border-border-dark bg-transparent px-1 font-josefin text-[8px] uppercase leading-relaxed tracking-[0.08em] text-text-muted"
        >
          {sourcePlaying("full")
            ? "Pause"
            : "Hear in song"}
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

      <p className="mt-2 text-center font-josefin text-[7px] uppercase tracking-[0.09em] text-text-darkest">
        Play along = vocals + drums + bass · guitar removed
      </p>
    </div>
  );
}
