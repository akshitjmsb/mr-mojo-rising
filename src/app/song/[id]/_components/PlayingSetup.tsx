"use client";

import { useMemo } from "react";
import type { Chord, PracticeProfile } from "@/lib/database.types";
import {
  getPracticeTuning,
  PRACTICE_TUNINGS,
  transposeChord,
  type PracticeTuningId,
} from "@/lib/guitar";

interface Props {
  profile: PracticeProfile;
  chords: Chord[];
  currentTime: number;
  saving: boolean;
  saveError: boolean;
  onTuningChange: (id: PracticeTuningId) => void;
}

function findCurrentChord(chords: Chord[], currentTime: number) {
  let low = 0;
  let high = chords.length - 1;
  let match: Chord | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (chords[middle].start_time <= currentTime) {
      match = chords[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (!match && chords.length > 0) return chords[0];
  return match && currentTime <= match.end_time ? match : null;
}

export default function PlayingSetup({
  profile,
  chords,
  currentTime,
  saving,
  saveError,
  onTuningChange,
}: Props) {
  const tuning = getPracticeTuning(profile.tuning_id);
  const currentChord = useMemo(
    () => findCurrentChord(chords, currentTime),
    [chords, currentTime],
  );
  const soundingChord = currentChord?.chord_standard ?? null;
  const shapeChord = soundingChord
    ? transposeChord(soundingChord, profile.chord_shape_shift)
    : null;

  return (
    <section className="mx-5 mb-3 rounded-[2px] border border-border-dark bg-gold/[0.025] px-3.5 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-josefin text-[9px] uppercase tracking-[0.2em] text-gold">
            Playing Setup
          </p>
          <p className="mt-1 font-josefin text-[10px] text-text-muted">
            {tuning.strings.join(" · ")}
          </p>
          <p className="mt-1 font-josefin text-[8px] uppercase tracking-[0.1em] text-text-dark">
            {profile.tuning_offset < 0
              ? `Tune every string down ${Math.abs(profile.tuning_offset)} semitone${Math.abs(profile.tuning_offset) === 1 ? "" : "s"}`
              : "Regular guitar tuning"}
          </p>
        </div>
        <div className="min-w-[70px] text-right">
          <p className="font-josefin text-[8px] uppercase tracking-[0.12em] text-text-dark">
            Play now
          </p>
          <p className="font-playfair text-[24px] italic leading-none text-gold">
            {shapeChord ?? "—"}
          </p>
          {shapeChord && soundingChord && shapeChord !== soundingChord && (
            <p className="mt-1 font-josefin text-[7px] uppercase tracking-[0.08em] text-text-darkest">
              sounds {soundingChord}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {PRACTICE_TUNINGS.map((option) => (
          <button
            key={option.id}
            onClick={() => onTuningChange(option.id)}
            disabled={saving}
            aria-pressed={profile.tuning_id === option.id}
            className={`min-h-8 cursor-pointer rounded-[1px] border px-1.5 font-josefin text-[8px] uppercase tracking-[0.08em] disabled:cursor-wait disabled:opacity-60 ${
              profile.tuning_id === option.id
                ? "border-gold bg-gold/5 text-gold"
                : "border-border bg-transparent text-text-muted"
            }`}
          >
            {option.name}
          </button>
        ))}
      </div>

      <p
        role={saveError ? "alert" : undefined}
        className={`mt-2 text-center font-josefin text-[8px] uppercase tracking-[0.1em] ${
          saveError ? "text-terracotta" : "text-text-darkest"
        }`}
      >
        {saveError
          ? "Could not save tuning"
          : saving
            ? "Saving setup…"
            : profile.chord_shape_shift
              ? "Chord names show the shapes your fingers play"
              : "Chord names match the recording pitch"}
      </p>
    </section>
  );
}
