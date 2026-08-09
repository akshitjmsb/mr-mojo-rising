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

type LessonId = "phrase" | "setup" | "chords" | "rhythm" | "play";

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
  currentSpeed: number;
  currentAudioSource: "guitar" | "bass" | "vocals" | "full";
  loopStart: number;
  loopEnd: number;
  savingTuning: boolean;
  tuningSaveError: boolean;
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
}

const LESSONS: Array<{
  id: LessonId;
  shortLabel: string;
  title: string;
  description: string;
}> = [
  {
    id: "phrase",
    shortLabel: "Choose",
    title: "What do you want to learn?",
    description: "Choose one part of the song. Every next step will focus only on it.",
  },
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
    id: "play",
    shortLabel: "Play",
    title: "Learn it one tiny phrase at a time",
    description: "Listen, copy, and loop a few seconds. Accuracy comes before speed.",
  },
];

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

function makePracticeRange(
  lesson: LessonId,
  section: Section | null,
  bpm: number | null,
): PracticeRange | null {
  if (
    !section ||
    lesson === "phrase" ||
    lesson === "setup" ||
    lesson === "chords" ||
    lesson === "play"
  ) return null;
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

export default function LearnMode({
  sections,
  chords,
  notes,
  bpm,
  profile,
  currentTime,
  isPlaying,
  currentSpeed,
  currentAudioSource,
  loopStart,
  loopEnd,
  savingTuning,
  tuningSaveError,
  onTuningChange,
  onPractice,
  onReplay,
  onSeek,
  onBeforeTunerStart,
}: Props) {
  const [lessonIndex, setLessonIndex] = useState(0);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [tunerComplete, setTunerComplete] = useState(false);
  const [practiceSpeed, setPracticeSpeed] = useState<PracticeSpeed>(0.65);
  const lesson = LESSONS[lessonIndex];
  const tuning = getPracticeTuning(profile.tuning_id);
  const section =
    sections.find((item) => item.id === selectedSectionId) ?? null;
  const sectionOptions = useMemo(
    () =>
      sections.map((item, index) => {
        const matchingSections = sections.filter(
          (candidate) => candidate.label === item.label,
        );
        const occurrence =
          sections
            .slice(0, index + 1)
            .filter((candidate) => candidate.label === item.label).length;
        return {
          section: item,
          label:
            matchingSections.length > 1
              ? `${item.label} ${occurrence}`
              : item.label,
        };
      }),
    [sections],
  );
  const selectedSectionPreview = section
    ? {
        start: section.start_time,
        end: Math.min(section.end_time, section.start_time + 8),
      }
    : null;
  const selectedSectionLabel =
    sectionOptions.find((option) => option.section.id === section?.id)?.label ??
    "Song phrase";
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
    if (!section || lesson.id !== "play") return [];
    return buildMusicalPhrases(
      reliableSectionNotes,
      section.start_time,
      section.end_time,
      {
        minimumDuration: 2,
        maximumDuration: 5.5,
        pauseThreshold: 0.28,
        leadIn: bpm && bpm > 0 ? Math.min(0.5, (60 / bpm) * 0.75) : 0.35,
        tail: bpm && bpm > 0 ? Math.min(0.65, 60 / bpm) : 0.45,
      },
    );
  }, [bpm, lesson.id, reliableSectionNotes, section]);
  const range = useMemo<PracticeRange | null>(
    () =>
      lesson.id === "play"
        ? (phraseRanges[Math.min(phraseIndex, phraseRanges.length - 1)] ??
          (section
            ? {
                start: section.start_time,
                end: Math.min(section.end_time, section.start_time + 5.5),
              }
            : null))
        : makePracticeRange(lesson.id, section, bpm),
    [bpm, lesson.id, phraseIndex, phraseRanges, section],
  );
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
  const isCurrentRangePlaying =
    range !== null &&
    isPlaying &&
    Math.abs(loopStart - range.start) < 0.05 &&
    Math.abs(loopEnd - range.end) < 0.05;
  const isSectionPreviewPlaying =
    selectedSectionPreview !== null &&
    isPlaying &&
    Math.abs(loopStart - selectedSectionPreview.start) < 0.05 &&
    Math.abs(loopEnd - selectedSectionPreview.end) < 0.05;
  const isolatedListenActive =
    isCurrentRangePlaying &&
    currentAudioSource === "guitar" &&
    Math.abs(currentSpeed - 1) < 0.01;
  const fullMixListenActive =
    isCurrentRangePlaying &&
    currentAudioSource === "full" &&
    Math.abs(currentSpeed - 1) < 0.01;
  const practiceLoopActive =
    isCurrentRangePlaying &&
    currentAudioSource === "guitar" &&
    Math.abs(currentSpeed - practiceSpeed) < 0.01;

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
  }

  function selectSection(nextSection: Section) {
    setSelectedSectionId(nextSection.id);
    setPhraseIndex(0);
  }

  function selectPhrase(nextIndex: number) {
    const clamped = Math.max(0, Math.min(phraseCount - 1, nextIndex));
    setPhraseIndex(clamped);
    const nextRange = phraseRanges[clamped];
    if (isPlaying && nextRange) onReplay(nextRange, practiceSpeed, "guitar");
  }

  function goNext() {
    if (lessonIndex < LESSONS.length - 1) selectLesson(lessonIndex + 1);
  }

  function selectPracticeSpeed(nextSpeed: PracticeSpeed) {
    const wasPracticing = practiceLoopActive;
    setPracticeSpeed(nextSpeed);
    try {
      window.localStorage.setItem(
        PRACTICE_SPEED_STORAGE_KEY,
        String(nextSpeed),
      );
    } catch {
      // Keep the in-memory selection when storage is unavailable.
    }
    if (wasPracticing && range) onReplay(range, nextSpeed, "guitar");
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

  function playPhrase(
    nextSpeed: PracticeSpeed,
    source: LessonAudioSource,
    rememberAsPracticeSpeed = false,
  ) {
    if (!range) return;
    const samePlayback =
      isCurrentRangePlaying &&
      currentAudioSource === source &&
      Math.abs(currentSpeed - nextSpeed) < 0.01;

    if (rememberAsPracticeSpeed) {
      setPracticeSpeed(nextSpeed);
      try {
        window.localStorage.setItem(
          PRACTICE_SPEED_STORAGE_KEY,
          String(nextSpeed),
        );
      } catch {
        // Keep the in-memory selection when storage is unavailable.
      }
    }

    if (samePlayback) {
      onPractice(range, nextSpeed, source);
    } else {
      onReplay(range, nextSpeed, source);
    }
  }

  return (
    <section className="mx-5 mt-3 mb-4 rounded-[3px] border border-gold/35 bg-gold/[0.035] p-4">
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
            disabled={index > 0 && !section}
            aria-current={index === lessonIndex ? "step" : undefined}
            className={`min-h-10 cursor-pointer rounded-[2px] border px-1 font-josefin text-[7px] uppercase tracking-[0.07em] disabled:cursor-default disabled:opacity-35 ${
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
        {lesson.id !== "phrase" && section && (
          <button
            type="button"
            onClick={() => selectLesson(0)}
            className="mb-3 flex min-h-9 w-full cursor-pointer items-center justify-between rounded-[2px] border border-gold/25 bg-gold/[0.04] px-3 text-left"
          >
            <span className="font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted">
              Learning · <span className="text-gold">{selectedSectionLabel}</span>
            </span>
            <span className="font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark">
              Change
            </span>
          </button>
        )}

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

        {lesson.id === "phrase" && (
          <div className="mt-4">
            <div className="grid grid-cols-2 gap-2" aria-label="Song phrases">
              {sectionOptions.map((option) => {
                const selected = option.section.id === section?.id;
                return (
                  <button
                    key={option.section.id}
                    type="button"
                    onClick={() => selectSection(option.section)}
                    aria-pressed={selected}
                    className={`min-h-16 cursor-pointer rounded-[2px] border px-3 py-2 text-left ${
                      selected
                        ? "border-gold bg-gold/10"
                        : "border-border-dark bg-bg/30"
                    }`}
                  >
                    <span className={`block font-playfair text-[17px] italic ${selected ? "text-gold" : "text-text"}`}>
                      {option.label}
                    </span>
                    <span className="mt-1 block font-josefin text-[8px] tracking-[0.08em] text-text-dark">
                      {formatTime(option.section.start_time)}–{formatTime(option.section.end_time)}
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedSectionPreview && (
              <button
                type="button"
                onClick={() =>
                  isSectionPreviewPlaying
                    ? onPractice(selectedSectionPreview, 1, "guitar")
                    : onReplay(selectedSectionPreview, 1, "guitar")
                }
                className="mt-3 min-h-11 w-full cursor-pointer rounded-[2px] border border-gold bg-gold/10 px-4 font-josefin text-[9px] uppercase tracking-[0.14em] text-gold"
              >
                {isSectionPreviewPlaying
                  ? "Pause preview"
                  : `Hear ${selectedSectionLabel}`}
              </button>
            )}

            {sectionOptions.length === 0 && (
              <p className="rounded-[2px] border border-border-dark p-3 font-josefin text-[10px] text-text-muted">
                Song phrases are still being detected.
              </p>
            )}
          </div>
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

        {lesson.id === "play" && range && (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-josefin text-[8px] uppercase tracking-[0.16em] text-text-dark">
                Phrase {phraseIndex + 1} of {phraseCount}
              </p>
              <p className="font-josefin text-[9px] text-text-dark">
                {formatTime(range.start)}–{formatTime(range.end)}
              </p>
            </div>

            <div className="mt-3 rounded-[2px] border border-border-dark bg-bg/40 p-3">
              <p className="font-josefin text-[8px] uppercase tracking-[0.16em] text-gold">
                1 · Listen
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => playPhrase(1, "guitar")}
                  aria-pressed={isolatedListenActive}
                  className={`min-h-14 cursor-pointer rounded-[2px] border font-josefin uppercase tracking-[0.1em] ${
                    isolatedListenActive
                      ? "border-gold bg-gold/10 text-gold"
                      : "border-gold/45 bg-transparent text-text"
                  }`}
                >
                  <span className="block text-[9px]">
                    {isolatedListenActive ? "Pause" : "Hear guitar"}
                  </span>
                  <span className="mt-1 block text-[7px] text-text-dark">
                    Isolated · 100%
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => playPhrase(1, "full")}
                  aria-pressed={fullMixListenActive}
                  className={`min-h-14 cursor-pointer rounded-[2px] border font-josefin uppercase tracking-[0.1em] ${
                    fullMixListenActive
                      ? "border-gold bg-gold/10 text-gold"
                      : "border-border-dark bg-transparent text-text-muted"
                  }`}
                >
                  <span className="block text-[9px]">
                    {fullMixListenActive ? "Pause" : "Hear in song"}
                  </span>
                  <span className="mt-1 block text-[7px] text-text-dark">
                    Full mix · 100%
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-3 border-t border-border-dark pt-3">
              <p className="mb-2 font-josefin text-[8px] uppercase tracking-[0.16em] text-gold">
                2 · Copy this tab
              </p>
              <SoloPhraseTab
                notes={reliableSectionNotes}
                range={range}
                strings={tuning.strings}
                currentTime={currentTime}
                onSeek={onSeek}
              />
            </div>

            <div className="mt-3 border-t border-border-dark pt-3">
              <fieldset>
                <legend className="font-josefin text-[8px] uppercase tracking-[0.16em] text-gold">
                  3 · Loop it slowly
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
                        className={`min-h-11 cursor-pointer rounded-[2px] border px-1 font-josefin ${
                          selected
                            ? "border-gold bg-gold/10 text-gold"
                            : "border-border-dark bg-transparent text-text-muted"
                        }`}
                      >
                        <span className="block text-[9px]">
                          {option.percent}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <button
                type="button"
                onClick={() => playPhrase(practiceSpeed, "guitar", true)}
                aria-pressed={practiceLoopActive}
                className="mt-2 min-h-11 w-full cursor-pointer rounded-[2px] border border-gold bg-gold/10 px-4 font-josefin text-[9px] uppercase tracking-[0.14em] text-gold"
              >
                {practiceLoopActive
                  ? "Pause loop"
                  : `Loop guitar · ${Math.round(practiceSpeed * 100)}%`}
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border-dark pt-3">
              <button
                onClick={() => selectPhrase(phraseIndex - 1)}
                disabled={phraseIndex === 0}
                className="min-h-9 cursor-pointer rounded-[2px] border border-border bg-transparent px-2 font-josefin text-[8px] uppercase tracking-[0.1em] text-text-muted disabled:cursor-default disabled:opacity-30"
              >
                Previous phrase
              </button>
              <button
                onClick={() => selectPhrase(phraseIndex + 1)}
                disabled={phraseIndex >= phraseCount - 1}
                className="min-h-9 cursor-pointer rounded-[2px] border border-border bg-transparent px-2 font-josefin text-[8px] uppercase tracking-[0.1em] text-text-muted disabled:cursor-default disabled:opacity-30"
              >
                Next phrase
              </button>
            </div>
          </div>
        )}

        {lesson.id === "play" && !range && (
          <div className="mt-4 rounded-[2px] border border-border-dark p-3">
            <p className="font-josefin text-[10px] leading-relaxed text-text-muted">
              No reliable guitar notes were found in this part yet.
            </p>
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
              disabled={
                (lesson.id === "phrase" && !section) ||
                (lesson.id === "setup" && !tunerComplete)
              }
              className="min-h-9 cursor-pointer rounded-[2px] border border-border px-3 font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted disabled:cursor-default disabled:opacity-40"
            >
              {lesson.id === "phrase" && !section
                ? "Choose a phrase"
                : lesson.id === "phrase"
                  ? "Learn this phrase · Next"
                : lesson.id === "setup" && !tunerComplete
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
