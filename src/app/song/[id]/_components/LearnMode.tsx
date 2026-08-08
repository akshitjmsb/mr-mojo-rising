"use client";

import { useMemo, useState } from "react";
import type {
  Chord,
  PracticeProfile,
  Section,
  TabNote,
} from "@/lib/database.types";
import {
  getPracticeTuning,
  positionNotesForTuning,
  transposeChord,
  type PracticeTuningId,
} from "@/lib/guitar";

type LessonId = "setup" | "chords" | "rhythm" | "intro" | "solo";

type PracticeRange = {
  start: number;
  end: number;
};

interface Props {
  sections: Section[];
  chords: Chord[];
  notes: TabNote[];
  profile: PracticeProfile;
  currentTime: number;
  isPlaying: boolean;
  loopStart: number;
  loopEnd: number;
  savingTuning: boolean;
  tuningSaveError: boolean;
  onTuningChange: (id: PracticeTuningId) => void;
  onPractice: (range: PracticeRange, speed: number) => void;
}

const LESSONS: Array<{
  id: LessonId;
  shortLabel: string;
  title: string;
  description: string;
}> = [
  {
    id: "setup",
    shortLabel: "Tune",
    title: "Get the guitar ready",
    description: "Tune down first. Everything becomes easier when your guitar matches the recording.",
  },
  {
    id: "chords",
    shortLabel: "Chords",
    title: "Learn the shapes",
    description: "Make each shape clean before trying to keep up with the song.",
  },
  {
    id: "rhythm",
    shortLabel: "Rhythm",
    title: "Make the changes musical",
    description: "Use slow down-strums first. Rhythm can become more detailed later.",
  },
  {
    id: "intro",
    shortLabel: "Intro",
    title: "Copy one tiny phrase",
    description: "Listen, copy, and loop a few seconds. Do not read the whole tab at once.",
  },
  {
    id: "solo",
    shortLabel: "Solo",
    title: "Build the solo phrase by phrase",
    description: "The solo is the final step—not the starting point. Accuracy comes before speed.",
  },
];

const PHRASE_SECONDS: Record<"intro" | "solo", number> = {
  intro: 4,
  solo: 3,
};

const STRING_DESCRIPTIONS = [
  "thinnest",
  "second",
  "third",
  "fourth",
  "fifth",
  "thickest",
] as const;

const FINGER_NAMES = ["index", "middle", "ring", "little"] as const;

function findSection(sections: Section[], lesson: LessonId) {
  const patterns: Record<Exclude<LessonId, "setup">, RegExp[]> = {
    chords: [/verse/i, /chorus/i, /intro/i],
    rhythm: [/chorus/i, /verse/i, /intro/i],
    intro: [/intro/i],
    solo: [/solo/i, /lead/i],
  };
  if (lesson === "setup") return sections[0] ?? null;
  for (const pattern of patterns[lesson]) {
    const match = sections.find((section) => pattern.test(section.label));
    if (match) return match;
  }
  return sections[0] ?? null;
}

function makePracticeRange(
  lesson: LessonId,
  section: Section | null,
  phraseIndex: number,
  contentStart?: number,
): PracticeRange | null {
  if (!section || lesson === "setup") return null;
  if (lesson === "chords" || lesson === "rhythm") {
    const length = lesson === "chords" ? 8 : 6;
    return {
      start: section.start_time,
      end: Math.min(section.end_time, section.start_time + length),
    };
  }
  const length = PHRASE_SECONDS[lesson];
  const firstPhraseStart = Math.max(section.start_time, contentStart ?? section.start_time);
  const start = firstPhraseStart + phraseIndex * length;
  return {
    start: Math.min(start, Math.max(section.start_time, section.end_time - length)),
    end: Math.min(section.end_time, start + length),
  };
}

function formatTime(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remainder = Math.floor(Math.max(0, seconds) % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function fingerForFret(fret: number, baseFret: number) {
  if (fret === 0) return "Play it open";
  const fingerIndex = Math.max(0, Math.min(3, fret - baseFret));
  return `Try your ${FINGER_NAMES[fingerIndex]} finger`;
}

export default function LearnMode({
  sections,
  chords,
  notes,
  profile,
  currentTime,
  isPlaying,
  loopStart,
  loopEnd,
  savingTuning,
  tuningSaveError,
  onTuningChange,
  onPractice,
}: Props) {
  const [lessonIndex, setLessonIndex] = useState(0);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const lesson = LESSONS[lessonIndex];
  const tuning = getPracticeTuning(profile.tuning_id);
  const section = findSection(sections, lesson.id);
  const positionedNotes = useMemo(
    () => positionNotesForTuning(notes, profile.tuning_offset),
    [notes, profile.tuning_offset],
  );
  const firstSectionNote =
    section && (lesson.id === "intro" || lesson.id === "solo")
      ? positionedNotes.find(
          (note) =>
            note.start_time >= section.start_time &&
            note.start_time < section.end_time,
        )
      : null;
  const contentStart = firstSectionNote
    ? Math.max(section?.start_time ?? 0, firstSectionNote.start_time - 0.25)
    : section?.start_time;
  const range = makePracticeRange(
    lesson.id,
    section,
    phraseIndex,
    contentStart,
  );
  const phraseNotes = useMemo(() => {
    if (!range) return [];
    return positionedNotes.filter(
      (note) => note.start_time >= range.start && note.start_time < range.end,
    );
  }, [positionedNotes, range]);
  const sectionChords = useMemo(() => {
    if (!section) return [];
    const unique: string[] = [];
    for (const chord of chords) {
      if (
        chord.start_time < section.start_time ||
        chord.start_time >= section.end_time
      ) {
        continue;
      }
      const shape = transposeChord(
        chord.chord_standard,
        profile.chord_shape_shift,
      );
      if (/^(n|no chord|silence)$/i.test(shape)) continue;
      if (!unique.includes(shape)) unique.push(shape);
      if (unique.length === 6) break;
    }
    return unique;
  }, [chords, profile.chord_shape_shift, section]);

  const phraseLength =
    lesson.id === "intro" || lesson.id === "solo"
      ? PHRASE_SECONDS[lesson.id]
      : null;
  const phraseCount =
    phraseLength && section
      ? Math.max(
          1,
          Math.ceil((section.end_time - (contentStart ?? section.start_time)) / phraseLength),
        )
      : 1;
  const activeNoteIndex = phraseNotes.findIndex(
    (note) =>
      currentTime >= note.start_time &&
      currentTime <= note.start_time + Math.max(note.duration, 0.12),
  );
  const instructionStart = activeNoteIndex >= 0 ? activeNoteIndex : 0;
  const instructionNotes = phraseNotes.slice(instructionStart, instructionStart + 3);
  const positiveFrets = phraseNotes
    .map((note) => note.fret)
    .filter((fret) => fret > 0);
  const baseFret = positiveFrets.length > 0 ? Math.min(...positiveFrets) : 1;
  const practiceSpeed = lesson.id === "solo" ? 0.5 : lesson.id === "intro" ? 0.55 : 0.65;
  const isCurrentRangePlaying =
    range !== null &&
    isPlaying &&
    Math.abs(loopStart - range.start) < 0.05 &&
    Math.abs(loopEnd - range.end) < 0.05;

  function selectLesson(index: number) {
    setLessonIndex(index);
    setPhraseIndex(0);
  }

  function goNext() {
    if (lessonIndex < LESSONS.length - 1) selectLesson(lessonIndex + 1);
  }

  return (
    <section className="mx-5 mb-4 rounded-[3px] border border-gold/35 bg-gold/[0.035] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-josefin text-[9px] uppercase tracking-[0.22em] text-gold">
            Learn Patience
          </p>
          <p className="mt-1 font-josefin text-[9px] text-text-dark">
            One small win at a time
          </p>
        </div>
        <p className="font-playfair text-[17px] italic text-text-muted">
          {lessonIndex + 1} / {LESSONS.length}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1" aria-label="Lesson steps">
        {LESSONS.map((item, index) => (
          <button
            key={item.id}
            onClick={() => selectLesson(index)}
            aria-current={index === lessonIndex ? "step" : undefined}
            className={`min-h-10 cursor-pointer rounded-[2px] border px-1 font-josefin text-[7px] uppercase tracking-[0.07em] ${
              index === lessonIndex
                ? "border-gold bg-gold/10 text-gold"
                : index < lessonIndex
                  ? "border-gold/25 bg-transparent text-text-muted"
                  : "border-border-dark bg-transparent text-text-dark"
            }`}
          >
            <span className="block text-[8px]">{index < lessonIndex ? "✓" : index + 1}</span>
            {item.shortLabel}
          </button>
        ))}
      </div>

      <div className="mt-4 border-t border-border-dark pt-4">
        <p className="font-playfair text-[22px] italic leading-tight text-text">
          {lesson.title}
        </p>
        <p className="mt-1.5 font-josefin text-[10px] font-thin leading-relaxed text-text-muted">
          {lesson.description}
        </p>

        {lesson.id === "setup" && (
          <div className="mt-4 rounded-[2px] border border-border-dark bg-bg/50 p-3">
            <p className="font-josefin text-[8px] uppercase tracking-[0.16em] text-text-dark">
              Patience uses
            </p>
            <p className="mt-1 font-playfair text-[20px] italic text-gold">
              E♭ Standard
            </p>
            <p className="mt-1 font-josefin text-[10px] leading-relaxed text-text-muted">
              From the thickest string: E♭ · A♭ · D♭ · G♭ · B♭ · E♭. Lower every string by one semitone.
            </p>
            <button
              onClick={() => onTuningChange("eb-standard")}
              disabled={savingTuning || profile.tuning_id === "eb-standard"}
              className="mt-3 min-h-10 w-full cursor-pointer rounded-[2px] border border-gold bg-gold/10 px-3 font-josefin text-[9px] uppercase tracking-[0.13em] text-gold disabled:cursor-default disabled:opacity-60"
            >
              {savingTuning
                ? "Saving…"
                : profile.tuning_id === "eb-standard"
                  ? "✓ App set to E♭ Standard"
                  : "Use E♭ Standard"}
            </button>
            {tuningSaveError && (
              <p role="alert" className="mt-2 text-center font-josefin text-[9px] text-terracotta">
                Tuning could not be saved. Try once more.
              </p>
            )}
          </div>
        )}

        {lesson.id === "chords" && (
          <div className="mt-4">
            <p className="font-josefin text-[8px] uppercase tracking-[0.16em] text-text-dark">
              Your first shapes
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {sectionChords.map((chord) => (
                <span
                  key={chord}
                  className="min-w-12 rounded-[2px] border border-border-dark bg-bg/50 px-3 py-2 text-center font-playfair text-[18px] italic text-gold"
                >
                  {chord}
                </span>
              ))}
            </div>
            <p className="mt-3 font-josefin text-[10px] leading-relaxed text-text-muted">
              Hold each shape, pick every string, and fix any buzz. Then change between two shapes without a timer.
            </p>
          </div>
        )}

        {lesson.id === "rhythm" && (
          <div className="mt-4 rounded-[2px] border border-border-dark bg-bg/50 p-3">
            <p className="font-josefin text-[8px] uppercase tracking-[0.16em] text-text-dark">
              Beginner rhythm
            </p>
            <p className="mt-2 font-playfair text-[18px] italic text-gold">
              ↓ &nbsp; ↓ &nbsp; ↓ &nbsp; ↓
            </p>
            <p className="mt-2 font-josefin text-[10px] leading-relaxed text-text-muted">
              One relaxed down-strum per beat. Keep moving even if a chord change is imperfect.
            </p>
          </div>
        )}

        {(lesson.id === "intro" || lesson.id === "solo") && range && (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-josefin text-[8px] uppercase tracking-[0.16em] text-text-dark">
                Phrase {phraseIndex + 1} · only this phrase matters
              </p>
              <p className="font-josefin text-[9px] text-text-dark">
                {formatTime(range.start)}–{formatTime(range.end)}
              </p>
            </div>

            <div className="mt-2 space-y-2" aria-live="polite">
              {instructionNotes.map((note, index) => {
                const next = instructionNotes[index + 1];
                const stringLabel = [...tuning.strings].reverse()[note.string_num - 1];
                const slidesTo =
                  next &&
                  next.string_num === note.string_num &&
                  next.fret !== note.fret &&
                  next.start_time <= note.start_time + note.duration + 0.35
                    ? next.fret
                    : null;
                return (
                  <div
                    key={note.id}
                    className={`rounded-[2px] border px-3 py-2.5 ${
                      index === 0
                        ? "border-gold/60 bg-gold/[0.06]"
                        : "border-border-dark bg-bg/40"
                    }`}
                  >
                    <p className="font-josefin text-[11px] leading-relaxed text-text">
                      {index + 1}. Pick the {STRING_DESCRIPTIONS[note.string_num - 1]} {stringLabel} string, {note.fret === 0 ? "open" : `fret ${note.fret}`}.
                    </p>
                    <p className="mt-1 font-josefin text-[8px] uppercase tracking-[0.1em] text-text-dark">
                      {fingerForFret(note.fret, baseFret)}
                      {slidesTo !== null ? ` · then slide to fret ${slidesTo}` : ""}
                    </p>
                    {slidesTo !== null && (
                      <p className="mt-1 font-josefin text-[9px] text-gold">
                        {note.fret}/{slidesTo} means slide—keep pressing while your finger moves.
                      </p>
                    )}
                  </div>
                );
              })}
              {instructionNotes.length === 0 && (
                <p className="rounded-[2px] border border-border-dark p-3 font-josefin text-[10px] leading-relaxed text-text-muted">
                  Listen to this phrase first. The AI did not find a reliable note here, so copy the sound instead of guessing from a tab.
                </p>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setPhraseIndex((value) => Math.max(0, value - 1))}
                disabled={phraseIndex === 0}
                className="min-h-9 cursor-pointer rounded-[2px] border border-border bg-transparent px-2 font-josefin text-[8px] uppercase tracking-[0.1em] text-text-muted disabled:cursor-default disabled:opacity-30"
              >
                Previous phrase
              </button>
              <button
                onClick={() =>
                  setPhraseIndex((value) => Math.min(phraseCount - 1, value + 1))
                }
                disabled={phraseIndex >= phraseCount - 1}
                className="min-h-9 cursor-pointer rounded-[2px] border border-border bg-transparent px-2 font-josefin text-[8px] uppercase tracking-[0.1em] text-text-muted disabled:cursor-default disabled:opacity-30"
              >
                Next phrase
              </button>
            </div>
          </div>
        )}

        {range && (
          <button
            onClick={() => onPractice(range, practiceSpeed)}
            className="mt-4 min-h-11 w-full cursor-pointer rounded-[2px] border border-gold bg-gold/10 px-4 font-josefin text-[10px] uppercase tracking-[0.14em] text-gold"
          >
            {isCurrentRangePlaying
              ? "Pause"
              : `Play slow loop · ${Math.round(practiceSpeed * 100)}%`}
          </button>
        )}

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-dark pt-3">
          <button
            onClick={() => selectLesson(Math.max(0, lessonIndex - 1))}
            disabled={lessonIndex === 0}
            className="min-h-9 cursor-pointer border-none bg-transparent px-2 font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted disabled:cursor-default disabled:opacity-30"
          >
            Back
          </button>
          {lessonIndex < LESSONS.length - 1 ? (
            <button
              onClick={goNext}
              className="min-h-9 cursor-pointer rounded-[2px] border border-border px-3 font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted"
            >
              I’m comfortable · Next
            </button>
          ) : (
            <p className="font-josefin text-[8px] uppercase tracking-[0.12em] text-gold">
              Repeat slowly, then add 5%
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
