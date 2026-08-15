"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  Chord,
  PracticeProfile,
  Section,
  StemLayer,
  TabNote,
} from "@/lib/database.types";
import { getSongPracticeTuning } from "@/lib/guitar";
import {
  clampLearningRange,
  defaultLearningRangeForSection,
  type LearningRange,
} from "@/lib/learning-range";
import { buildRhythmChordChanges } from "@/lib/rhythm-chords";
import LearningRangePicker from "./LearningRangePicker";
import LeadNotesTrainer from "./LeadNotesTrainer";
import RhythmChordFlow from "./RhythmChordFlow";

type LearningInstrument = "lead" | "rhythm";

type PracticeRange = {
  start: number;
  end: number;
};

type LessonAudioSource =
  | "guitar"
  | "lead"
  | "rhythm"
  | "bass"
  | "vocals"
  | "drums"
  | "backing"
  | "full";

const FULL_TRACK_PART_ID = "__full_track__";

interface Props {
  songId: string;
  stemLayers: StemLayer[];
  sections: Section[];
  chords: Chord[];
  tabNotes: TabNote[];
  bpm: number | null;
  hasGuitarStem: boolean;
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

const INSTRUMENTS: Array<{
  id: LearningInstrument;
  label: string;
  purpose: string;
}> = [
  { id: "lead", label: "Lead guitar", purpose: "Follow the detected notes" },
  { id: "rhythm", label: "Rhythm guitar", purpose: "Follow the chord changes" },
];

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
  return (
    <div className="mt-3 flex min-h-10 items-center justify-between gap-3 rounded-[2px] border border-border-dark bg-bg/30 px-3 py-2">
      <p className="font-josefin text-[8px] uppercase tracking-[0.1em] text-text-muted">
        Tuning · <span className="text-gold">{tuning.name}</span>
      </p>
      <Link
        href={`/tuner?tuning=${tuning.id}`}
        className="shrink-0 font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark underline decoration-border underline-offset-2"
      >
        Tuner
      </Link>
    </div>
  );
}

export default function LearnMode({
  songId,
  stemLayers,
  sections,
  chords,
  tabNotes,
  bpm,
  hasGuitarStem,
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
  const [selectedLayerKey, setSelectedLayerKey] = useState<string | null>(null);
  const [selectedInstrument, setSelectedInstrument] =
    useState<LearningInstrument | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [learningRange, setLearningRange] = useState<LearningRange | null>(null);
  const [practiceMix, setPracticeMix] = useState<"isolated" | "full">(
    "isolated",
  );

  const selectedLayer = stemLayers.find(
    (layer) => layer.layer_key === selectedLayerKey,
  );
  const visibleLayers = stemLayers.filter(
    (layer) => layer.instrument !== "guitar" || layer.role === "all",
  );
  const hasLeadFocus = stemLayers.some(
    (layer) =>
      layer.instrument === "guitar" &&
      layer.role === "lead" &&
      layer.quality_status === "ready",
  );
  const hasRhythmFocus = stemLayers.some(
    (layer) =>
      layer.instrument === "guitar" &&
      layer.role === "rhythm" &&
      layer.quality_status === "ready",
  );
  const selectedLayerInstrument = selectedLayer?.instrument ?? null;
  const isReferenceLayer = Boolean(
    selectedLayer && selectedLayerInstrument !== "guitar",
  );
  const selectedLayerAudioSource: LessonAudioSource =
    selectedLayerInstrument === "vocals" ||
    selectedLayerInstrument === "drums" ||
    selectedLayerInstrument === "full"
      ? selectedLayerInstrument
      : selectedLayerInstrument === "bass"
        ? "bass"
        : "guitar";
  const section =
    sections.find((item) => item.id === selectedSectionId) ?? null;
  const sectionOptions = useMemo(
    () =>
      sections.map((item, index) => {
        const sameLabel = sections.filter(
          (candidate) => candidate.label === item.label,
        );
        const occurrence = sections
          .slice(0, index + 1)
          .filter((candidate) => candidate.label === item.label).length;
        return {
          section: item,
          label:
            sameLabel.length > 1
              ? `${item.label} ${occurrence}`
              : item.label,
          leadNoteCount: tabNotes.filter(
            (note) =>
              note.role === "lead" &&
              (note.role_confidence == null || note.role_confidence >= 0.6) &&
              note.start_time >= item.start_time &&
              note.start_time < item.end_time,
          ).length,
        };
      }),
    [sections, tabNotes],
  );
  const selectedSectionLabel =
    sectionOptions.find((option) => option.section.id === section?.id)?.label ??
    "Song part";
  const fullReferenceRange = useMemo<PracticeRange | null>(() => {
    if (sections.length === 0) return null;
    return {
      start: Math.min(...sections.map((item) => item.start_time)),
      end: Math.max(...sections.map((item) => item.end_time)),
    };
  }, [sections]);
  const activeReferenceRange = useMemo<PracticeRange | null>(() => {
    if (!selectedSectionId) return null;
    if (selectedSectionId === FULL_TRACK_PART_ID) return fullReferenceRange;
    const selectedPart = sections.find(
      (item) => item.id === selectedSectionId,
    );
    if (!selectedPart) return null;
    return {
      start: selectedPart.start_time,
      end: selectedPart.end_time,
    };
  }, [fullReferenceRange, sections, selectedSectionId]);
  const selectedReferenceLabel =
    selectedSectionId === FULL_TRACK_PART_ID
      ? "Full song"
      : sectionOptions.find(
            (option) => option.section.id === selectedSectionId,
          )?.label ?? "Song part";
  const referencePlaybackActive = Boolean(
    activeReferenceRange &&
      isPlaying &&
      Math.abs(loopStart - activeReferenceRange.start) < 0.05 &&
      Math.abs(loopEnd - activeReferenceRange.end) < 0.05 &&
      currentAudioSource === selectedLayerAudioSource,
  );
  const rhythmChordChanges = useMemo(() => {
    if (!learningRange) return [];
    return buildRhythmChordChanges(
      chords,
      learningRange.start,
      learningRange.end,
      profile.chord_shape_shift,
    );
  }, [chords, learningRange, profile.chord_shape_shift]);
  const rhythmSource: LessonAudioSource =
    practiceMix === "full" ? "full" : hasRhythmFocus ? "rhythm" : "guitar";
  const rhythmPlaybackActive = Boolean(
    learningRange &&
      isPlaying &&
      Math.abs(loopStart - learningRange.start) < 0.05 &&
      Math.abs(loopEnd - learningRange.end) < 0.05 &&
      currentAudioSource === rhythmSource,
  );

  function resetSelection() {
    onPause();
    setSelectedLayerKey(null);
    setSelectedInstrument(null);
    setSelectedSectionId(null);
    setLearningRange(null);
    setPracticeMix("isolated");
  }

  function selectLayer(layer: StemLayer) {
    onPause();
    setSelectedLayerKey(layer.layer_key);
    setSelectedInstrument(null);
    setSelectedSectionId(null);
    setLearningRange(null);
  }

  function selectInstrument(instrument: LearningInstrument) {
    if (!hasGuitarStem) return;
    setSelectedInstrument(instrument);
    setSelectedSectionId(null);
    setLearningRange(null);
    setPracticeMix("isolated");
  }

  function selectSection(nextSection: Section) {
    setSelectedSectionId(nextSection.id);
    setLearningRange(
      defaultLearningRangeForSection(
        nextSection.start_time,
        nextSection.end_time,
      ),
    );
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
    const nextRange = clampLearningRange(
      learningRange,
      section.start_time,
      section.end_time,
      "end",
    );
    setLearningRange(nextRange);
    if (isPlaying) onReplay(nextRange, 1, currentAudioSource);
  }

  function toggleReference() {
    if (!activeReferenceRange) return;
    if (referencePlaybackActive) {
      onPractice(activeReferenceRange, 1, selectedLayerAudioSource);
    } else {
      onReplay(activeReferenceRange, 1, selectedLayerAudioSource);
    }
  }

  function toggleRhythm() {
    if (!learningRange) return;
    if (rhythmPlaybackActive) {
      onPractice(learningRange, 1, rhythmSource);
    } else {
      onReplay(learningRange, 1, rhythmSource);
    }
  }

  return (
    <section className="mx-5 mb-4 mt-3 rounded-[3px] border border-gold/35 bg-gold/[0.035] p-4">
      {!selectedLayer ? (
        <div>
          <p className="font-playfair text-[23px] italic leading-tight text-text">
            Choose a sound
          </p>
          <div
            className="mt-4 grid grid-cols-2 gap-2"
            aria-label="Separated audio layers"
          >
            {visibleLayers.map((layer) => (
              <button
                key={layer.layer_key}
                type="button"
                onClick={() => selectLayer(layer)}
                className="min-h-20 cursor-pointer rounded-[2px] border border-border-dark bg-bg/30 px-3 py-3 text-left"
              >
                <span className="block font-playfair text-[16px] italic leading-tight text-text">
                  {layer.label}
                </span>
                <span className="mt-2 block font-josefin text-[7px] uppercase tracking-[0.1em] text-gold/75">
                  {layer.instrument === "guitar" ? "Learn" : "Listen"}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : isReferenceLayer ? (
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="font-playfair text-[22px] italic text-text">
              {selectedLayer.label}
            </p>
            <button
              type="button"
              onClick={resetSelection}
              className="min-h-9 px-2 font-josefin text-[7px] uppercase tracking-[0.12em] text-text-muted"
            >
              Change
            </button>
          </div>
          {!activeReferenceRange ? (
            <div className="mt-4">
              <p className="mb-3 font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted">
                Choose a part
              </p>
              <div className="grid grid-cols-2 gap-2" aria-label="Song parts">
                {fullReferenceRange && (
                  <button
                    type="button"
                    onClick={() => setSelectedSectionId(FULL_TRACK_PART_ID)}
                    className="min-h-16 cursor-pointer rounded-[2px] border border-border-dark bg-bg/30 px-3 py-2 text-left"
                  >
                    <span className="block font-playfair text-[17px] italic text-text">
                      Full song
                    </span>
                    <span className="mt-1 block font-josefin text-[8px] tracking-[0.08em] text-text-dark">
                      {formatTime(fullReferenceRange.start)}–
                      {formatTime(fullReferenceRange.end)}
                    </span>
                  </button>
                )}
                {sectionOptions.map((option) => (
                  <button
                    key={option.section.id}
                    type="button"
                    onClick={() => setSelectedSectionId(option.section.id)}
                    className="min-h-16 cursor-pointer rounded-[2px] border border-border-dark bg-bg/30 px-3 py-2 text-left"
                  >
                    <span className="block font-playfair text-[17px] italic text-text">
                      {option.label}
                    </span>
                    <span className="mt-1 block font-josefin text-[8px] tracking-[0.08em] text-text-dark">
                      {formatTime(option.section.start_time)}–
                      {formatTime(option.section.end_time)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex min-h-12 items-center justify-between gap-3 border-y border-border-dark py-2">
                <div>
                  <p className="font-playfair text-[17px] italic text-text">
                    {selectedReferenceLabel}
                  </p>
                  <p className="mt-1 font-josefin text-[8px] tracking-[0.08em] text-text-dark">
                    {formatTime(activeReferenceRange.start)}–
                    {formatTime(activeReferenceRange.end)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onPause();
                    setSelectedSectionId(null);
                  }}
                  className="min-h-9 px-2 font-josefin text-[7px] uppercase tracking-[0.12em] text-text-muted"
                >
                  Change part
                </button>
              </div>
              <button
                type="button"
                onClick={toggleReference}
                aria-pressed={referencePlaybackActive}
                className="mt-3 min-h-12 w-full cursor-pointer rounded-[2px] border border-gold bg-gold/10 px-4 font-josefin text-[10px] uppercase tracking-[0.16em] text-gold"
              >
                {referencePlaybackActive
                  ? "Pause"
                  : `Play ${selectedReferenceLabel}`}
              </button>
              <p className="mt-2 text-center font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark">
                {selectedLayer.label} · original tempo
              </p>
            </div>
          )}
        </div>
      ) : !selectedInstrument ? (
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="font-playfair text-[22px] italic text-text">
              How do you want to play it?
            </p>
            <button
              type="button"
              onClick={resetSelection}
              className="min-h-9 px-2 font-josefin text-[7px] uppercase tracking-[0.12em] text-text-muted"
            >
              Change
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {INSTRUMENTS.map((option) => (
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
      ) : (
        <div>
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-border-dark pb-3">
            <p className="font-josefin text-[9px] uppercase tracking-[0.12em] text-gold">
              {selectedInstrument === "lead" ? "Lead guitar" : "Rhythm guitar"}
            </p>
            <button
              type="button"
              onClick={resetSelection}
              className="min-h-9 px-2 font-josefin text-[7px] uppercase tracking-[0.12em] text-text-muted"
            >
              Start over
            </button>
          </div>

          {!section || !learningRange ? (
            <div>
              <p className="mb-3 font-playfair text-[21px] italic text-text">
                Choose a part
              </p>
              <div className="grid grid-cols-2 gap-2" aria-label="Song parts">
                {sectionOptions.map((option) => (
                  <button
                    key={option.section.id}
                    type="button"
                    onClick={() => selectSection(option.section)}
                    className="min-h-16 cursor-pointer rounded-[2px] border border-border-dark bg-bg/30 px-3 py-2 text-left"
                  >
                    <span className="block font-playfair text-[17px] italic text-text">
                      {option.label}
                    </span>
                    <span className="mt-1 block font-josefin text-[8px] tracking-[0.08em] text-text-dark">
                      {formatTime(option.section.start_time)}–
                      {formatTime(option.section.end_time)}
                    </span>
                    {selectedInstrument === "lead" &&
                      option.leadNoteCount >= 3 && (
                        <span className="mt-1.5 block font-josefin text-[7px] uppercase tracking-[0.1em] text-gold">
                          Lead detected
                        </span>
                      )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <LearningRangePicker
                section={section}
                sectionLabel={selectedSectionLabel}
                range={learningRange}
                onChangeSection={() => {
                  onPause();
                  setSelectedSectionId(null);
                  setLearningRange(null);
                }}
                onBoundaryChange={changeLearningBoundary}
                onBoundaryCommit={commitLearningRange}
              />
              <SongTuningNote songId={songId} profile={profile} />

              {selectedInstrument === "lead" ? (
                <LeadNotesTrainer
                  notes={tabNotes}
                  selection={learningRange}
                  bpm={bpm}
                  profile={profile}
                  currentTime={currentTime}
                  currentSpeed={currentSpeed}
                  currentAudioSource={currentAudioSource}
                  isPlaying={isPlaying}
                  loopStart={loopStart}
                  loopEnd={loopEnd}
                  hasBackingTrack={hasBackingTrack}
                  focusSource={hasLeadFocus ? "lead" : "guitar"}
                  onPractice={onPractice}
                  onReplay={onReplay}
                  onSeek={onSeek}
                  onPause={onPause}
                />
              ) : (
                <div className="mt-4 border-t border-border-dark pt-4">
                  <div className="grid grid-cols-2 gap-1" aria-label="Practice audio">
                    {(["isolated", "full"] as const).map((mix) => (
                      <button
                        key={mix}
                        type="button"
                        onClick={() => {
                          setPracticeMix(mix);
                          if (rhythmPlaybackActive) {
                            onReplay(
                              learningRange,
                              1,
                              mix === "full"
                                ? "full"
                                : hasRhythmFocus
                                  ? "rhythm"
                                  : "guitar",
                            );
                          }
                        }}
                        aria-pressed={practiceMix === mix}
                        className={`min-h-9 cursor-pointer border-b font-josefin text-[8px] uppercase tracking-[0.1em] ${
                          practiceMix === mix
                            ? "border-gold text-gold"
                            : "border-border-dark text-text-dark"
                        }`}
                      >
                        {mix === "full"
                          ? "Song"
                          : hasRhythmFocus
                            ? "Rhythm Focus"
                            : "Guitar Focus"}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={toggleRhythm}
                    aria-pressed={rhythmPlaybackActive}
                    className="mt-3 min-h-12 w-full cursor-pointer rounded-[2px] border border-gold bg-gold/10 px-4 font-josefin text-[10px] uppercase tracking-[0.16em] text-gold"
                  >
                    {rhythmPlaybackActive ? "Pause" : "Play at original tempo"}
                  </button>
                  <RhythmChordFlow
                    changes={rhythmChordChanges}
                    start={learningRange.start}
                    end={learningRange.end}
                    currentTime={currentTime}
                    onSeek={onSeek}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
