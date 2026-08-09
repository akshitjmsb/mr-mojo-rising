"use client";

import { useEffect, useMemo, useState } from "react";
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
import { buildMusicalPhrases, type PracticePhrase } from "@/lib/solo-phrases";
import InlineTuner from "./InlineTuner";
import ChordShapeCoach from "./ChordShapeCoach";
import RhythmTimeline from "./RhythmTimeline";
import SoloPhraseTab from "./SoloPhraseTab";

type LessonId = "setup" | "chords" | "rhythm" | "intro" | "solo";

type PracticeRange = {
  start: number;
  end: number;
};

type LessonAudioSource = "guitar" | "full";

interface Props {
  sections: Section[];
  chords: Chord[];
  notes: TabNote[];
  bpm: number | null;
  profile: PracticeProfile;
  currentTime: number;
  isPlaying: boolean;
  currentAudioSource: "guitar" | "bass" | "vocals" | "full";
  loopStart: number;
  loopEnd: number;
  savingTuning: boolean;
  tuningSaveError: boolean;
  completedLoops: number;
  repetitionsPerStep: number;
  bestPracticeSpeed: number;
  countInEnabled: boolean;
  autoRampEnabled: boolean;
  onTuningChange: (id: PracticeTuningId) => void;
  onPractice: (
    range: PracticeRange,
    speed: number,
    source?: LessonAudioSource,
  ) => void;
  onReplay: (
    range: PracticeRange,
    speed: number,
    source?: LessonAudioSource,
  ) => void;
  onSeek: (time: number) => void;
  onBeforeTunerStart: () => void;
  onToggleCountIn: () => void;
  onToggleAutoRamp: () => void;
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

const STRING_DESCRIPTIONS = [
  "thinnest",
  "second",
  "third",
  "fourth",
  "fifth",
  "thickest",
] as const;

const FINGER_NAMES = ["index", "middle", "ring", "little"] as const;

const PRACTICE_SPEEDS = [
  { value: 0.5, percent: 50, purpose: "Learn" },
  { value: 0.65, percent: 65, purpose: "Build" },
  { value: 0.8, percent: 80, purpose: "Prepare" },
  { value: 1, percent: 100, purpose: "Original" },
] as const;

const RHYTHM_SPEEDS = [
  { speed: 0.8, label: "Slow", percent: "80%", source: "guitar" },
  { speed: 1, label: "Original", percent: "100%", source: "full" },
] as const;

type PracticeSpeed = (typeof PRACTICE_SPEEDS)[number]["value"];

const PRACTICE_SPEED_STORAGE_KEY = "mr-mojo:learn-speed:v1";

function isPracticeSpeed(value: number): value is PracticeSpeed {
  return PRACTICE_SPEEDS.some((option) => option.value === value);
}

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
  bpm: number | null,
): PracticeRange | null {
  if (!section || lesson === "setup" || lesson === "chords") return null;
  if (lesson === "rhythm") {
    const twoBars = bpm && bpm > 0 ? (8 * 60) / bpm : 6;
    return {
      start: section.start_time,
      end: Math.min(section.end_time, section.start_time + twoBars),
    };
  }
  return null;
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
  bpm,
  profile,
  currentTime,
  isPlaying,
  currentAudioSource,
  loopStart,
  loopEnd,
  savingTuning,
  tuningSaveError,
  completedLoops,
  repetitionsPerStep,
  bestPracticeSpeed,
  countInEnabled,
  autoRampEnabled,
  onTuningChange,
  onPractice,
  onReplay,
  onSeek,
  onBeforeTunerStart,
  onToggleCountIn,
  onToggleAutoRamp,
}: Props) {
  const [lessonIndex, setLessonIndex] = useState(0);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [showFullSolo, setShowFullSolo] = useState(false);
  const [tunerComplete, setTunerComplete] = useState(false);
  const [practiceSpeed, setPracticeSpeed] = useState<PracticeSpeed>(0.65);
  const lesson = LESSONS[lessonIndex];
  const tuning = getPracticeTuning(profile.tuning_id);
  const section = findSection(sections, lesson.id);
  const positionedNotes = useMemo(
    () => positionNotesForTuning(notes, profile.tuning_offset),
    [notes, profile.tuning_offset],
  );
  const reliableSectionNotes = useMemo(
    () =>
      section
        ? positionedNotes.filter(
            (note) =>
              note.start_time >= section.start_time &&
              note.start_time < section.end_time &&
              (note.confidence === null ||
                note.confidence >= profile.tab_confidence_threshold),
          )
        : [],
    [positionedNotes, profile.tab_confidence_threshold, section],
  );
  const phraseRanges = useMemo<PracticePhrase[]>(() => {
    if (!section || (lesson.id !== "intro" && lesson.id !== "solo")) return [];
    return buildMusicalPhrases(
      reliableSectionNotes,
      section.start_time,
      section.end_time,
      lesson.id === "solo"
        ? { minimumDuration: 1.8, maximumDuration: 5.5, pauseThreshold: 0.28 }
        : { minimumDuration: 1.5, maximumDuration: 4.5, pauseThreshold: 0.32 },
    );
  }, [lesson.id, reliableSectionNotes, section]);
  const range =
    lesson.id === "intro" || lesson.id === "solo"
      ? (phraseRanges[Math.min(phraseIndex, phraseRanges.length - 1)] ?? null)
      : makePracticeRange(lesson.id, section, bpm);
  const phraseNotes = useMemo(() => {
    if (!range) return [];
    const source =
      lesson.id === "intro" || lesson.id === "solo"
        ? reliableSectionNotes
        : positionedNotes;
    return source.filter(
      (note) => note.start_time >= range.start && note.start_time < range.end,
    );
  }, [lesson.id, positionedNotes, range, reliableSectionNotes]);
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

  const phraseCount = Math.max(1, phraseRanges.length);
  const fullSoloRange: PracticePhrase | null =
    lesson.id === "solo" && section
      ? { start: section.start_time, end: section.end_time }
      : null;
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
  const effectiveBpm = bpm ? Math.round(bpm * practiceSpeed) : null;
  const isCurrentRangePlaying =
    range !== null &&
    isPlaying &&
    Math.abs(loopStart - range.start) < 0.05 &&
    Math.abs(loopEnd - range.end) < 0.05;
  const phraseLoopProgress = completedLoops % repetitionsPerStep;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const storedSpeed = Number.parseFloat(
          window.localStorage.getItem(PRACTICE_SPEED_STORAGE_KEY) ?? "",
        );
        if (isPracticeSpeed(storedSpeed)) setPracticeSpeed(storedSpeed);
      } catch {
        // Practice still works when private browsing blocks local storage.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function selectLesson(index: number) {
    setLessonIndex(index);
    setPhraseIndex(0);
    setShowFullSolo(false);
  }

  function selectPhrase(nextIndex: number) {
    const clamped = Math.max(0, Math.min(phraseCount - 1, nextIndex));
    setPhraseIndex(clamped);
    const nextRange = phraseRanges[clamped];
    if (isPlaying && nextRange) onReplay(nextRange, practiceSpeed);
  }

  function seekInFullSolo(time: number) {
    const nextIndex = phraseRanges.findIndex(
      (phrase) => time >= phrase.start && time <= phrase.end,
    );
    if (nextIndex >= 0) {
      const nextRange = phraseRanges[nextIndex];
      setPhraseIndex(nextIndex);
      if (isPlaying) onReplay(nextRange, practiceSpeed);
    }
    onSeek(time);
  }

  function goNext() {
    if (lessonIndex < LESSONS.length - 1) selectLesson(lessonIndex + 1);
  }

  function selectPracticeSpeed(nextSpeed: PracticeSpeed) {
    setPracticeSpeed(nextSpeed);
    try {
      window.localStorage.setItem(
        PRACTICE_SPEED_STORAGE_KEY,
        String(nextSpeed),
      );
    } catch {
      // Keep the in-memory selection when storage is unavailable.
    }
    if (isCurrentRangePlaying && range) onReplay(range, nextSpeed);
  }

  function playRhythm(
    nextSpeed: 0.8 | 1,
    source: LessonAudioSource,
  ) {
    if (!range) return;
    const samePlayingSpeed =
      isCurrentRangePlaying &&
      practiceSpeed === nextSpeed &&
      currentAudioSource === source;
    setPracticeSpeed(nextSpeed);
    try {
      window.localStorage.setItem(
        PRACTICE_SPEED_STORAGE_KEY,
        String(nextSpeed),
      );
    } catch {
      // Keep the in-memory selection when storage is unavailable.
    }
    if (samePlayingSpeed) {
      onPractice(range, nextSpeed, source);
    } else {
      onReplay(range, nextSpeed, source);
    }
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
        {lesson.id !== "chords" && lesson.id !== "rhythm" && (
          <>
            <p className="font-playfair text-[22px] italic leading-tight text-text">
              {lesson.title}
            </p>
            <p className="mt-1.5 font-josefin text-[10px] font-thin leading-relaxed text-text-muted">
              {lesson.description}
            </p>
          </>
        )}

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
            <InlineTuner
              onBeforeStart={onBeforeTunerStart}
              onComplete={() => {
                if (profile.tuning_id !== "eb-standard") {
                  onTuningChange("eb-standard");
                }
                setTunerComplete(true);
              }}
            />
          </div>
        )}

        {lesson.id === "chords" && (
          <div className="mt-1">
            <ChordShapeCoach
              chords={sectionChords}
              tuningOffset={profile.tuning_offset}
            />
          </div>
        )}

        {lesson.id === "rhythm" && range && (
          <div className="mt-2">
            <RhythmTimeline
              notes={reliableSectionNotes}
              start={range.start}
              end={range.end}
              currentTime={currentTime}
              active={isCurrentRangePlaying}
              bpm={bpm}
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              {RHYTHM_SPEEDS.map((option) => {
                const active =
                  practiceSpeed === option.speed &&
                  currentAudioSource === option.source &&
                  isCurrentRangePlaying;
                return (
                  <button
                    key={option.speed}
                    type="button"
                    onClick={() =>
                      playRhythm(option.speed, option.source)
                    }
                    aria-pressed={active}
                    className={`min-h-16 cursor-pointer rounded-[2px] border font-josefin uppercase tracking-[0.12em] ${
                      active
                        ? "border-gold bg-gold/10 text-gold"
                        : "border-border-dark bg-transparent text-text-muted"
                    }`}
                  >
                    <span className="block text-[10px]">
                      {active ? "Pause" : option.label}
                    </span>
                    <span className="mt-1 block text-[8px] text-text-dark">
                      {option.percent}
                    </span>
                  </button>
                );
              })}
            </div>
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

            {lesson.id === "solo" && (
              <div className="mt-2.5">
                <SoloPhraseTab
                  notes={reliableSectionNotes}
                  range={range}
                  strings={tuning.strings}
                  currentTime={currentTime}
                  onSeek={onSeek}
                />
                <button
                  type="button"
                  onClick={() => setShowFullSolo((value) => !value)}
                  aria-expanded={showFullSolo}
                  className="mt-2 min-h-9 w-full cursor-pointer rounded-[2px] border border-border bg-transparent px-3 font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted"
                >
                  {showFullSolo ? "Hide entire solo" : "Show entire solo"}
                </button>
                {showFullSolo && fullSoloRange && (
                  <div className="mt-2.5">
                    <p className="mb-1.5 font-josefin text-[8px] uppercase tracking-[0.13em] text-text-dark">
                      Entire solo · swipe sideways · tap any fret to jump
                    </p>
                    <SoloPhraseTab
                      notes={reliableSectionNotes}
                      range={fullSoloRange}
                      strings={tuning.strings}
                      currentTime={currentTime}
                      expanded
                      onSeek={seekInFullSolo}
                    />
                  </div>
                )}
              </div>
            )}

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

            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                onClick={() => selectPhrase(phraseIndex - 1)}
                disabled={phraseIndex === 0}
                className="min-h-9 cursor-pointer rounded-[2px] border border-border bg-transparent px-2 font-josefin text-[8px] uppercase tracking-[0.1em] text-text-muted disabled:cursor-default disabled:opacity-30"
              >
                Previous
              </button>
              <button
                onClick={() => onReplay(range, practiceSpeed)}
                className="min-h-9 cursor-pointer rounded-[2px] border border-gold/60 bg-gold/[0.06] px-2 font-josefin text-[8px] uppercase tracking-[0.1em] text-gold"
              >
                Replay
              </button>
              <button
                onClick={() => selectPhrase(phraseIndex + 1)}
                disabled={phraseIndex >= phraseCount - 1}
                className="min-h-9 cursor-pointer rounded-[2px] border border-border bg-transparent px-2 font-josefin text-[8px] uppercase tracking-[0.1em] text-text-muted disabled:cursor-default disabled:opacity-30"
              >
                Next
              </button>
            </div>

            <div
              className="mt-3 border-t border-border-dark pt-3"
              aria-label="Phrase practice"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-1.5" aria-label={`${phraseLoopProgress} of ${repetitionsPerStep} loops`}>
                  {Array.from({ length: repetitionsPerStep }, (_, index) => (
                    <span
                      key={index}
                      className={`h-2 w-2 rounded-full ${
                        index < phraseLoopProgress
                          ? "bg-gold"
                          : "bg-border-dark"
                      }`}
                    />
                  ))}
                </div>
                {bestPracticeSpeed > 0 && (
                  <span className="font-josefin text-[8px] uppercase tracking-[0.1em] text-text-dark">
                    Best {Math.round(bestPracticeSpeed * 100)}%
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onToggleCountIn}
                  disabled={!bpm}
                  aria-pressed={countInEnabled}
                  className={`min-h-9 cursor-pointer rounded-[2px] border font-josefin text-[8px] uppercase tracking-[0.1em] disabled:cursor-default disabled:opacity-40 ${
                    countInEnabled
                      ? "border-gold bg-gold/10 text-gold"
                      : "border-border-dark text-text-muted"
                  }`}
                >
                  Count-in
                </button>
                <button
                  type="button"
                  onClick={onToggleAutoRamp}
                  aria-pressed={autoRampEnabled}
                  className={`min-h-9 cursor-pointer rounded-[2px] border font-josefin text-[8px] uppercase tracking-[0.1em] ${
                    autoRampEnabled
                      ? "border-gold bg-gold/10 text-gold"
                      : "border-border-dark text-text-muted"
                  }`}
                >
                  Auto +5%
                </button>
              </div>
            </div>
          </div>
        )}

        {range && lesson.id !== "rhythm" && (
          <div className="mt-4">
            <fieldset>
              <legend className="font-josefin text-[8px] uppercase tracking-[0.16em] text-text-dark">
                Practice speed
              </legend>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {PRACTICE_SPEEDS.map((option) => {
                  const selected = practiceSpeed === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => selectPracticeSpeed(option.value)}
                      aria-pressed={selected}
                      className={`min-h-12 cursor-pointer rounded-[2px] border px-1 font-josefin ${
                        selected
                          ? "border-gold bg-gold/10 text-gold"
                          : "border-border-dark bg-transparent text-text-muted"
                      }`}
                    >
                      <span className="block text-[10px]">
                        {option.percent}%
                      </span>
                      <span className="mt-0.5 block text-[6px] uppercase tracking-[0.08em]">
                        {option.purpose}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <p className="mt-2 text-center font-josefin text-[8px] uppercase tracking-[0.1em] text-text-dark">
              {effectiveBpm
                ? practiceSpeed === 1
                  ? `Original tempo · ${effectiveBpm} BPM`
                  : `${effectiveBpm} BPM · original ${Math.round(bpm!)} BPM`
                : practiceSpeed === 1
                  ? "Original recording speed"
                  : `${Math.round(practiceSpeed * 100)}% of original speed`}
            </p>

            <button
              onClick={() => onPractice(range, practiceSpeed)}
              className="mt-2 min-h-11 w-full cursor-pointer rounded-[2px] border border-gold bg-gold/10 px-4 font-josefin text-[10px] uppercase tracking-[0.14em] text-gold"
            >
              {isCurrentRangePlaying
                ? `Pause loop · ${Math.round(practiceSpeed * 100)}%`
                : practiceSpeed === 1
                  ? "Play at original tempo"
                  : `Play loop · ${Math.round(practiceSpeed * 100)}%`}
            </button>
          </div>
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
              disabled={lesson.id === "setup" && !tunerComplete}
              className="min-h-9 cursor-pointer rounded-[2px] border border-border px-3 font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted disabled:cursor-default disabled:opacity-40"
            >
              {lesson.id === "setup" && !tunerComplete
                ? "Tune all strings to continue"
                : "I’m comfortable · Next"}
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
