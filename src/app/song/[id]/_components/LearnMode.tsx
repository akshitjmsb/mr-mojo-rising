"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  Chord,
  PracticeProfile,
  Section,
  StemLayer,
} from "@/lib/database.types";
import { getSongPracticeTuning } from "@/lib/guitar";
import {
  clampLearningRange,
  defaultLearningRangeForSection,
  type LearningRange,
} from "@/lib/learning-range";
import { buildRhythmChordChanges } from "@/lib/rhythm-chords";
import type { LeadTabReference } from "@/lib/verified-tabs";
import LearningRangePicker from "./LearningRangePicker";
import LeadNotesTrainer from "./LeadNotesTrainer";
import RhythmChordFlow from "./RhythmChordFlow";

type LessonId = "phrase" | "practice";
type LearningInstrument = "lead" | "rhythm" | "bass";

type PracticeRange = {
  start: number;
  end: number;
};

type LessonAudioSource =
  | "guitar"
  | "bass"
  | "vocals"
  | "drums"
  | "backing"
  | "full";

interface Props {
  songId: string;
  leadTabReference: LeadTabReference | null;
  stemLayers: StemLayer[];
  sections: Section[];
  chords: Chord[];
  bpm: number | null;
  hasGuitarStem: boolean;
  hasBassStem: boolean;
  hasBackingTrack: boolean;
  profile: PracticeProfile;
  currentTime: number;
  isPlaying: boolean;
  currentSpeed: number;
  currentAudioSource: LessonAudioSource;
  loopStart: number;
  loopEnd: number;
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
  onPause: () => void;
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
    title: "Choose a separated layer",
    description: "Start with the sound you want to learn. Then choose the exact song part.",
  },
  {
    id: "practice",
    shortLabel: "Practice",
    title: "Practice",
    description: "Press play, follow the music, and copy what you hear.",
  },
];

const INSTRUMENTS: Array<{
  id: LearningInstrument;
  label: string;
  purpose: string;
}> = [
  { id: "lead", label: "Lead guitar", purpose: "Isolated audio · truth-gated tab" },
  { id: "rhythm", label: "Rhythm guitar", purpose: "Chord & strum focus" },
  { id: "bass", label: "Bass guitar", purpose: "Bass stem & groove" },
];

function makePracticeRange(
  lesson: LessonId,
  learningRange: LearningRange | null,
): PracticeRange | null {
  if (!learningRange || lesson === "phrase") return null;
  return learningRange;
}

function formatTime(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remainder = Math.floor(Math.max(0, seconds) % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function SongTuningNote({
  songId,
  profile,
}: {
  songId: string;
  profile: PracticeProfile;
}) {
  const tuning = getSongPracticeTuning(songId, profile.tuning_id);
  const detail =
    tuning.offset === -1
      ? "All strings down one semitone"
      : tuning.offset === 0
        ? "Standard pitch"
        : `${Math.abs(tuning.offset)} semitones below standard`;

  return (
    <div className="mt-3 flex min-h-10 items-center justify-between gap-3 rounded-[2px] border border-border-dark bg-bg/30 px-3 py-2">
      <p className="font-josefin text-[8px] uppercase tracking-[0.1em] text-text-muted">
        Song tuning · <span className="text-gold">{tuning.name}</span>
        <span className="mt-0.5 block text-[7px] normal-case tracking-normal text-text-dark">
          {detail}
        </span>
      </p>
      <Link
        href="/tuner"
        className="shrink-0 font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark underline decoration-border underline-offset-2"
      >
        Open Tuner
      </Link>
    </div>
  );
}

export default function LearnMode({
  songId,
  leadTabReference,
  stemLayers,
  sections,
  chords,
  bpm,
  hasGuitarStem,
  hasBassStem,
  hasBackingTrack,
  profile,
  currentTime,
  isPlaying,
  currentSpeed,
  currentAudioSource,
  loopStart,
  loopEnd,
  onPractice,
  onReplay,
  onSeek,
  onPause,
}: Props) {
  const [lessonIndex, setLessonIndex] = useState(0);
  const [selectedInstrument, setSelectedInstrument] =
    useState<LearningInstrument | null>(null);
  const [selectedLayerKey, setSelectedLayerKey] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [learningRange, setLearningRange] = useState<LearningRange | null>(null);
  const [showSectionChoices, setShowSectionChoices] = useState(true);
  const [practiceMix, setPracticeMix] = useState<"isolated" | "full">(
    "isolated",
  );
  const lessons = LESSONS;
  const lesson = lessons[lessonIndex];
  const instrument = INSTRUMENTS.find(
    (option) => option.id === selectedInstrument,
  );
  const selectedLayer = stemLayers.find(
    (layer) => layer.layer_key === selectedLayerKey,
  );
  const selectedLayerInstrument = selectedLayer?.instrument ?? null;
  const isReferenceLayer =
    selectedLayerInstrument === "vocals" ||
    selectedLayerInstrument === "drums" ||
    selectedLayerInstrument === "full";
  const selectedLayerAudioSource: LessonAudioSource =
    selectedLayerInstrument === "vocals" ||
    selectedLayerInstrument === "drums" ||
    selectedLayerInstrument === "full"
      ? selectedLayerInstrument
      : selectedLayerInstrument === "bass"
        ? "bass"
        : "guitar";
  const instrumentAudioSource: LessonAudioSource =
    selectedInstrument === "bass" ? "bass" : "guitar";
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
  const selectedSectionLabel =
    sectionOptions.find((option) => option.section.id === section?.id)?.label ??
    "Song part";
  const validReferenceRange = Boolean(
    section &&
      learningRange &&
      learningRange.start >= section.start_time &&
      learningRange.end <= section.end_time &&
      learningRange.end - learningRange.start >= 2,
  );
  const selectionRangeReady = isReferenceLayer
    ? validReferenceRange
    : selectedInstrument === "bass"
      ? Boolean(
          hasBassStem &&
            section &&
            learningRange &&
            learningRange.start >= section.start_time &&
            learningRange.end <= section.end_time &&
            learningRange.end - learningRange.start >= 2,
        )
      : Boolean(hasGuitarStem && validReferenceRange);
  const selectionReady =
    selectedInstrument !== null && selectionRangeReady && !showSectionChoices;
  const range = makePracticeRange(lesson.id, learningRange);
  const rhythmChordChanges = useMemo(() => {
    if (!learningRange) return [];
    return buildRhythmChordChanges(
      chords,
      learningRange.start,
      learningRange.end,
      profile.chord_shape_shift,
    );
  }, [chords, learningRange, profile.chord_shape_shift]);

  const isCurrentRangePlaying =
    range !== null &&
    isPlaying &&
    Math.abs(loopStart - range.start) < 0.05 &&
    Math.abs(loopEnd - range.end) < 0.05;
  const isSelectedRangePlaying =
    learningRange !== null &&
    isPlaying &&
    Math.abs(loopStart - learningRange.start) < 0.05 &&
    Math.abs(loopEnd - learningRange.end) < 0.05;
  const practiceAudioSource: LessonAudioSource =
    practiceMix === "full" ? "full" : instrumentAudioSource;
  const practicePlaybackActive =
    isCurrentRangePlaying &&
    currentAudioSource === practiceAudioSource &&
    Math.abs(currentSpeed - 1) < 0.01;

  function selectLesson(index: number) {
    setLessonIndex(index);
  }

  function selectInstrument(nextInstrument: LearningInstrument) {
    if (
      (nextInstrument === "bass" && !hasBassStem) ||
      (nextInstrument !== "bass" && !hasGuitarStem)
    ) {
      return;
    }
    setSelectedInstrument(nextInstrument);
    setSelectedSectionId(null);
    setLearningRange(null);
    setShowSectionChoices(true);
    setPracticeMix("isolated");
    setLessonIndex(0);
  }

  function selectLearningLayer(layer: StemLayer) {
    setSelectedLayerKey(layer.layer_key);
    setSelectedSectionId(null);
    setLearningRange(null);
    setShowSectionChoices(true);
    setLessonIndex(0);
    if (layer.instrument === "guitar") {
      return;
    }
    if (layer.instrument === "bass") {
      selectInstrument("bass");
    }
  }

  function selectSection(nextSection: Section) {
    setSelectedSectionId(nextSection.id);
    setLearningRange(
      defaultLearningRangeForSection(
        nextSection.start_time,
        nextSection.end_time,
      ),
    );
    setShowSectionChoices(false);
  }

  function changeLearningBoundary(
    boundary: "start" | "end",
    value: number,
  ) {
    if (!section || !learningRange) return;
    setLearningRange(
      clampLearningRange(
        { ...learningRange, [boundary]: value },
        section.start_time,
        section.end_time,
        boundary,
      ),
    );
  }

  function commitLearningRange() {
    if (!section || !learningRange) return;
    const committedRange = clampLearningRange(
      learningRange,
      section.start_time,
      section.end_time,
      "end",
    );
    setLearningRange(committedRange);
    if (isPlaying) {
      onReplay(
        committedRange,
        1,
        isReferenceLayer ? selectedLayerAudioSource : instrumentAudioSource,
      );
    }
  }

  function goNext() {
    if (lessonIndex < lessons.length - 1) selectLesson(lessonIndex + 1);
  }

  function playPracticeSource(source: LessonAudioSource) {
    if (!range) return;
    const samePlayback =
      isCurrentRangePlaying &&
      currentAudioSource === source &&
      Math.abs(currentSpeed - 1) < 0.01;

    if (samePlayback) {
      onPractice(range, 1, source);
    } else {
      onReplay(range, 1, source);
    }
  }

  return (
    <section className="mx-5 mt-3 mb-4 rounded-[3px] border border-gold/35 bg-gold/[0.035] p-4">
      <nav
        className="flex items-center justify-center gap-3 border-b border-border-dark pb-3"
        aria-label="Learning path"
      >
        {lessons.map((item, index) => (
          <button
            key={item.id}
            onClick={() => selectLesson(index)}
            disabled={
              index > 0 && !selectionReady
            }
            aria-current={index === lessonIndex ? "step" : undefined}
            className={`min-h-8 cursor-pointer border-none bg-transparent px-1 font-josefin text-[8px] uppercase tracking-[0.1em] disabled:cursor-default disabled:opacity-30 ${
              index === lessonIndex
                ? "text-gold"
                : index < lessonIndex
                  ? "text-text-muted"
                  : "text-text-dark"
            }`}
          >
            {index < lessonIndex ? "✓ " : `${index + 1} `}
            {item.shortLabel}
          </button>
        ))}
      </nav>

      <div className="pt-4">
        {lesson.id !== "phrase" && section && (
          <>
            <button
              type="button"
              onClick={() => selectLesson(0)}
              className="flex min-h-9 w-full cursor-pointer items-center justify-between rounded-[2px] border border-gold/25 bg-gold/[0.04] px-3 text-left"
            >
              <span className="font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted">
                <span className="text-gold">{instrument?.label}</span>
                {` · ${selectedSectionLabel}`}
                {learningRange
                  ? ` · ${formatTime(learningRange.start)}–${formatTime(learningRange.end)}`
                  : ""}
              </span>
              <span className="font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark">
                Change
              </span>
            </button>
            {selectedInstrument && (
              <SongTuningNote songId={songId} profile={profile} />
            )}
          </>
        )}

        {lesson.id !== "practice" && (
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
            {!selectedLayer && (
              stemLayers.length > 0 ? (
                <div
                  className="grid grid-cols-2 gap-2"
                  aria-label="Separated audio layers"
                >
                  {stemLayers.map((layer) => (
                    <button
                      key={layer.layer_key}
                      type="button"
                      onClick={() => selectLearningLayer(layer)}
                      className="min-h-20 cursor-pointer rounded-[2px] border border-border-dark bg-bg/30 px-3 py-3 text-left"
                    >
                      <span className="block font-playfair text-[16px] italic leading-tight text-text">
                        {layer.label}
                      </span>
                      <span className="mt-1.5 block font-josefin text-[7px] uppercase tracking-[0.08em] text-text-dark">
                        {layer.instrument === "guitar" || layer.instrument === "bass"
                          ? "Choose to learn"
                          : "Choose to listen"}
                      </span>
                      <span className="mt-2 block font-josefin text-[7px] uppercase tracking-[0.08em] text-gold/70">
                        {layer.quality_status === "ready" ? "Ready" : "Preview"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-[2px] border border-border-dark p-3 font-josefin text-[9px] text-text-muted">
                  Audio layers are still being prepared.
                </p>
              )
            )}

            {selectedLayerInstrument === "guitar" && !selectedInstrument && (
              <div>
                <button
                  type="button"
                  onClick={() => setSelectedLayerKey(null)}
                  className="mb-3 min-h-9 font-josefin text-[8px] uppercase tracking-[0.1em] text-text-dark"
                >
                  ← All layers
                </button>
                <p className="mb-3 font-josefin text-[8px] uppercase tracking-[0.12em] text-gold">
                  All Guitars · What do you want to practise?
                </p>
                <div className="grid grid-cols-2 gap-2" aria-label="Guitar learning focus">
                  {INSTRUMENTS.filter((option) => option.id !== "bass").map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => selectInstrument(option.id)}
                      className="min-h-20 cursor-pointer rounded-[2px] border border-border-dark bg-bg/30 px-3 py-3 text-left"
                    >
                      <span className="block font-playfair text-[16px] italic leading-tight text-text">
                        {option.label}
                      </span>
                      <span className="mt-1.5 block font-josefin text-[7px] leading-relaxed text-text-dark">
                        {option.purpose}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedInstrument && (
              <button
                type="button"
                onClick={() => {
                  setSelectedInstrument(null);
                  setSelectedLayerKey(null);
                  setSelectedSectionId(null);
                  setLearningRange(null);
                  setShowSectionChoices(true);
                }}
                className="mb-3 flex min-h-10 w-full cursor-pointer items-center justify-between rounded-[2px] border border-gold/25 bg-gold/[0.04] px-3 text-left"
              >
                <span className="font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted">
                  Learning · <span className="text-gold">{selectedLayer?.label} / {instrument?.label}</span>
                </span>
                <span className="font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark">
                  Change
                </span>
              </button>
            )}

            {isReferenceLayer && (
              <button
                type="button"
                onClick={() => {
                  onPause();
                  setSelectedLayerKey(null);
                  setSelectedSectionId(null);
                  setLearningRange(null);
                  setShowSectionChoices(true);
                }}
                className="mb-3 flex min-h-10 w-full cursor-pointer items-center justify-between rounded-[2px] border border-gold/25 bg-gold/[0.04] px-3 text-left"
              >
                <span className="font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted">
                  Listening · <span className="text-gold">{selectedLayer?.label}</span>
                </span>
                <span className="font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark">
                  Change
                </span>
              </button>
            )}

            {(selectedInstrument || isReferenceLayer) && showSectionChoices && (
              <div className="grid grid-cols-2 gap-2" aria-label="Song parts">
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
            )}

            {(selectedInstrument || isReferenceLayer) &&
              !showSectionChoices &&
              section &&
              learningRange && (
              <>
                <LearningRangePicker
                  section={section}
                  sectionLabel={selectedSectionLabel}
                  range={learningRange}
                  selectionReady={selectionRangeReady}
                  readyLabel={
                    isReferenceLayer
                      ? `${selectedLayer?.label} ready · original tempo`
                      : selectedInstrument === "bass"
                      ? "Bass stem ready"
                      : selectedInstrument === "lead"
                        ? "Lead audio ready · notation checked separately"
                        : "Guitar audio ready"
                  }
                  previewPlaying={
                    isSelectedRangePlaying &&
                    currentAudioSource ===
                      (isReferenceLayer
                        ? selectedLayerAudioSource
                        : instrumentAudioSource)
                  }
                  onChangeSection={() => setShowSectionChoices(true)}
                  onBoundaryChange={changeLearningBoundary}
                  onBoundaryCommit={commitLearningRange}
                  onPreview={() => {
                    const source = isReferenceLayer
                      ? selectedLayerAudioSource
                      : instrumentAudioSource;
                    if (
                      isSelectedRangePlaying &&
                      currentAudioSource === source
                    ) {
                      onPractice(learningRange, 1, source);
                    } else {
                      onReplay(learningRange, 1, source);
                    }
                  }}
                />
                {selectedInstrument && (
                  <SongTuningNote songId={songId} profile={profile} />
                )}
              </>
            )}

            {selectedInstrument && !showSectionChoices && section && !learningRange && (
              <div className="rounded-[2px] border border-terracotta/40 p-3">
                <p className="font-josefin text-[9px] leading-relaxed text-text-muted">
                  No reliable guitar was detected in this part.
                </p>
                <button
                  type="button"
                  onClick={() => setShowSectionChoices(true)}
                  className="mt-3 min-h-9 w-full cursor-pointer rounded-[2px] border border-border bg-transparent font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted"
                >
                  Choose another part
                </button>
              </div>
            )}

            {sectionOptions.length === 0 && (
              <p className="rounded-[2px] border border-border-dark p-3 font-josefin text-[10px] text-text-muted">
                Song parts are still being detected.
              </p>
            )}
          </div>
        )}

        {lesson.id === "practice" &&
          selectedInstrument === "lead" &&
          learningRange && (
            <LeadNotesTrainer
              key={`${learningRange.start}-${learningRange.end}`}
              songId={songId}
              communityReference={leadTabReference}
              selection={learningRange}
              bpm={bpm}
              currentSpeed={currentSpeed}
              currentAudioSource={currentAudioSource}
              isPlaying={isPlaying}
              loopStart={loopStart}
              loopEnd={loopEnd}
              hasBackingTrack={hasBackingTrack}
              onPractice={onPractice}
              onReplay={onReplay}
              onPause={onPause}
            />
          )}

        {lesson.id === "practice" &&
          selectedInstrument !== "lead" &&
          range && (
            <div className="mt-3">
              <div className="grid grid-cols-2 gap-1" aria-label="Practice audio">
                {(["isolated", "full"] as const).map((mix) => (
                  <button
                    key={mix}
                    type="button"
                    onClick={() => {
                      setPracticeMix(mix);
                      if (isCurrentRangePlaying) {
                        onReplay(
                          range,
                          1,
                          mix === "full" ? "full" : instrumentAudioSource,
                        );
                      }
                    }}
                    aria-pressed={practiceMix === mix}
                    className={`min-h-9 cursor-pointer border-b bg-transparent font-josefin text-[8px] uppercase tracking-[0.1em] ${
                      practiceMix === mix
                        ? "border-gold text-gold"
                        : "border-border-dark text-text-dark"
                    }`}
                  >
                    {mix === "full"
                      ? "Song"
                      : selectedInstrument === "bass"
                        ? "Bass"
                        : "Guitar"}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => playPracticeSource(practiceAudioSource)}
                aria-pressed={practicePlaybackActive}
                className="mt-3 min-h-12 w-full cursor-pointer rounded-[2px] border border-gold bg-gold/10 px-4 font-josefin text-[10px] uppercase tracking-[0.16em] text-gold"
              >
                {practicePlaybackActive ? "Pause" : "Play"}
              </button>
              <p className="mt-2 text-center font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark">
                Original tempo
              </p>

              {selectedInstrument === "rhythm" ? (
                <RhythmChordFlow
                  changes={rhythmChordChanges}
                  start={range.start}
                  end={range.end}
                  currentTime={currentTime}
                  onSeek={onSeek}
                />
              ) : (
                <p className="mt-4 border-t border-border-dark pt-3 font-josefin text-[9px] leading-relaxed text-text-muted">
                  Listen to the isolated bass and copy the line by ear.
                </p>
              )}
            </div>
          )}

        {lesson.id === "practice" && !range && (
          <div className="mt-4 rounded-[2px] border border-border-dark p-3">
            <p className="font-josefin text-[10px] leading-relaxed text-text-muted">
              No reliable guitar notes were found in this part yet.
            </p>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-dark pt-3">
          {isReferenceLayer ? (
            <p className="ml-auto font-josefin text-[8px] uppercase tracking-[0.12em] text-gold">
              Listen above · original tempo
            </p>
          ) : (
            <>
              <button
                onClick={() => selectLesson(Math.max(0, lessonIndex - 1))}
                disabled={lessonIndex === 0}
                className="min-h-9 cursor-pointer border-none bg-transparent px-2 font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted disabled:cursor-default disabled:opacity-30"
              >
                Back
              </button>
              {lessonIndex < lessons.length - 1 ? (
                <button
                  onClick={goNext}
                  disabled={
                    lesson.id === "phrase" && !selectionReady
                  }
                  className="min-h-9 cursor-pointer rounded-[2px] border border-border px-3 font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted disabled:cursor-default disabled:opacity-40"
                >
                  Next · Practice
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
