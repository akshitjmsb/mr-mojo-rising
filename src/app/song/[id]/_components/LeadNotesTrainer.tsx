"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LearningRange } from "@/lib/learning-range";
import type { PracticeProfile, TabNote } from "@/lib/database.types";
import { getSongPracticeTuning, positionNotesForTuning } from "@/lib/guitar";
import { extractLeadNotes } from "@/lib/lead-notes";
import SoloPhraseTab from "./SoloPhraseTab";

type AudioSource = "guitar" | "backing" | "full";

interface Props {
  notes: TabNote[];
  selection: LearningRange;
  bpm: number | null;
  profile: PracticeProfile;
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

const SOURCES: Array<{ id: AudioSource; label: string }> = [
  { id: "guitar", label: "Guitar Focus" },
  { id: "full", label: "Song" },
  { id: "backing", label: "Play along" },
];

export default function LeadNotesTrainer({
  notes,
  selection,
  bpm,
  profile,
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
  const [selectedSource, setSelectedSource] = useState<AudioSource>("guitar");
  const [countIn, setCountIn] = useState<number | null>(null);
  const countInTimersRef = useRef<number[]>([]);
  const countInAudioRef = useRef<AudioContext | null>(null);
  const tuning = getSongPracticeTuning(profile.song_id, profile.tuning_id);
  const bestNotes = useMemo(() => {
    const inRange = notes.filter(
      (note) =>
        note.start_time >= selection.start && note.start_time < selection.end,
    );
    const stronger = inRange.filter(
      (note) => note.confidence === null || note.confidence >= 0.4,
    );
    const candidates = stronger.length >= 3 ? stronger : inRange;
    return positionNotesForTuning(
      extractLeadNotes(candidates),
      profile.tuning_offset,
    );
  }, [notes, profile.tuning_offset, selection.end, selection.start]);
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
      countInTimersRef.current.push(
        window.setTimeout(() => setCountIn(4 - beat), beat * beatMs),
      );
    }
    countInTimersRef.current.push(
      window.setTimeout(() => {
        setCountIn(null);
        void context.close();
        countInAudioRef.current = null;
        countInTimersRef.current = [];
        onReplay(selection, 1, "backing");
      }, beatMs * 4),
    );
  }

  function togglePlayback() {
    if (selectedSourcePlaying) {
      onPractice(selection, 1, selectedSource);
    } else if (selectedSource === "backing") {
      startWithCountIn();
    } else {
      cancelCountIn();
      onReplay(selection, 1, selectedSource);
    }
  }

  return (
    <div className="mt-4 border-t border-border-dark pt-4">
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
            : "Play at original tempo"}
      </button>

      <div className="mt-5">
        <div className="mb-2 flex items-end justify-between gap-3">
          <p className="font-playfair text-[18px] italic text-text">
            AI best take
          </p>
          <p className="font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark">
            {bestNotes.length} detected notes
          </p>
        </div>
        {bestNotes.length > 0 ? (
          <SoloPhraseTab
            notes={bestNotes}
            range={selection}
            strings={tuning.strings}
            currentTime={currentTime}
            expanded
            onSeek={onSeek}
          />
        ) : (
          <p className="border-y border-border-dark py-4 text-center font-josefin text-[9px] text-text-muted">
            No playable notes were detected in this selection.
          </p>
        )}
        <p className="mt-2 font-josefin text-[7px] leading-relaxed tracking-[0.07em] text-text-darkest">
          Best detected take. Listen first; the highlighted notes follow at the
          original tempo.
        </p>
      </div>
    </div>
  );
}
