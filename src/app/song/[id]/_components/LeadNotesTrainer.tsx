"use client";

import { useEffect, useRef, useState } from "react";
import type { LearningRange } from "@/lib/learning-range";
import type { VerifiedLeadTab } from "@/lib/verified-tabs";

type AudioSource = "guitar" | "backing" | "full";

interface Props {
  verifiedTab: VerifiedLeadTab | null;
  selection: LearningRange;
  bpm: number | null;
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
  onPause: () => void;
}

const SOURCES: Array<{ id: AudioSource; label: string }> = [
  { id: "guitar", label: "Guitar" },
  { id: "full", label: "Song" },
  { id: "backing", label: "Backing" },
];

export default function LeadNotesTrainer({
  verifiedTab,
  selection,
  bpm,
  currentSpeed,
  currentAudioSource,
  isPlaying,
  loopStart,
  loopEnd,
  hasBackingTrack,
  onPractice,
  onReplay,
  onPause,
}: Props) {
  const [selectedSource, setSelectedSource] = useState<AudioSource>("guitar");
  const [countIn, setCountIn] = useState<number | null>(null);
  const countInTimersRef = useRef<number[]>([]);
  const countInAudioRef = useRef<AudioContext | null>(null);
  const selectionPlaying =
    isPlaying &&
    Math.abs(loopStart - selection.start) < 0.05 &&
    Math.abs(loopEnd - selection.end) < 0.05 &&
    Math.abs(currentSpeed - 1) < 0.01;
  const selectedSourcePlaying =
    selectionPlaying && currentAudioSource === selectedSource;

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

  function chooseSource(source: AudioSource) {
    if (source === "backing" && !hasBackingTrack) return;
    cancelCountIn();
    setSelectedSource(source);
    if (selectionPlaying) onReplay(selection, 1, source);
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

  function startWithCountIn() {
    cancelCountIn();
    onPause();
    const beatMs = 60_000 / Math.max(40, bpm ?? 120);
    const context = new AudioContext();
    countInAudioRef.current = context;
    void context.resume();
    setCountIn(4);

    for (let beat = 0; beat < 4; beat += 1) {
      scheduleCountInClick(
        context,
        context.currentTime + beat * (beatMs / 1000),
        beat === 0,
      );
      const timer = window.setTimeout(
        () => setCountIn(4 - beat),
        beat * beatMs,
      );
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

  function togglePlayback() {
    if (selectedSourcePlaying) {
      onPractice(selection, 1, selectedSource);
      return;
    }
    if (selectedSource === "backing") {
      startWithCountIn();
      return;
    }
    cancelCountIn();
    onReplay(selection, 1, selectedSource);
  }

  return (
    <div className="mt-3">
      <div className="grid grid-cols-3 gap-1" aria-label="Practice audio">
        {SOURCES.map((source) => {
          const selected = selectedSource === source.id;
          const unavailable = source.id === "backing" && !hasBackingTrack;
          return (
            <button
              key={source.id}
              type="button"
              onClick={() => chooseSource(source.id)}
              disabled={unavailable}
              aria-pressed={selected}
              className={`min-h-9 cursor-pointer border-b px-1 font-josefin text-[8px] uppercase tracking-[0.1em] disabled:cursor-default disabled:opacity-30 ${
                selected
                  ? "border-gold text-gold"
                  : "border-border-dark text-text-dark"
              }`}
            >
              {source.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={togglePlayback}
        aria-pressed={selectedSourcePlaying}
        className="mt-3 min-h-12 w-full cursor-pointer rounded-[2px] border border-gold bg-gold/10 px-4 font-josefin text-[10px] uppercase tracking-[0.16em] text-gold"
      >
        {countIn !== null
          ? `Count in · ${countIn}`
          : selectedSourcePlaying
            ? "Pause"
            : "Play"}
      </button>

      <p className="mt-2 text-center font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark">
        Original tempo
      </p>

      <div className="mt-3 border-y border-border-dark py-3">
        {verifiedTab ? (
          <a
            href={verifiedTab.url}
            target="_blank"
            rel="noreferrer"
            onClick={onPause}
            className="flex min-h-14 items-center justify-between gap-3 rounded-[2px] border border-gold/50 bg-gold/[0.06] px-4"
          >
            <span>
              <span className="block font-josefin text-[9px] uppercase tracking-[0.14em] text-gold">
                Slash tab · licensed source
              </span>
              <span className="mt-1 block font-josefin text-[8px] text-text-muted">
                {verifiedTab.track} · {verifiedTab.provider}
              </span>
            </span>
            <span className="shrink-0 font-josefin text-[8px] uppercase tracking-[0.1em] text-text-dark">
              Open ↗
            </span>
          </a>
        ) : (
          <p className="py-2 text-center font-josefin text-[9px] leading-relaxed text-text-muted">
            Verified lead tab is not available for this song yet.
          </p>
        )}
      </div>
    </div>
  );
}
