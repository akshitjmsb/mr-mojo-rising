"use client";

import { useMemo, useState } from "react";
import type {
  Chord,
  Lyrics,
  PracticeProfile,
  Section,
  StemLayer,
  TabNote,
} from "@/lib/database.types";
import { getSongPracticeTuning, positionNotesForTuning } from "@/lib/guitar";
import { extractLeadNotes } from "@/lib/lead-notes";
import { selectPrimarySongLayers } from "@/lib/primary-song-layers";
import { buildRhythmChordChanges } from "@/lib/rhythm-chords";
import RhythmChordFlow from "./RhythmChordFlow";
import SelectionDownloadButton from "./SelectionDownloadButton";
import SoloPhraseTab from "./SoloPhraseTab";
import SyncedLyrics from "./SyncedLyrics";

type AudioSource = "guitar" | "lead" | "rhythm" | "vocals" | "full";

type MapKind = "overview" | "chords" | "notes" | "lyrics" | "audio";

type MapPiece = {
  key: string;
  label: string;
  source: AudioSource;
  kind: MapKind;
  status: "Ready" | "Best available";
  qualityNote: string | null;
  downloadLayerKey: string;
};

type TimeRange = { start: number; end: number };

interface Props {
  songId: string;
  songTitle: string;
  stemLayers: StemLayer[];
  sections: Section[];
  chords: Chord[];
  lyrics: Lyrics | null;
  tabNotes: TabNote[];
  profile: PracticeProfile;
  currentTime: number;
  isPlaying: boolean;
  currentAudioSource: AudioSource;
  loopStart: number;
  loopEnd: number;
  onPractice: (range: TimeRange, speed: number, source?: AudioSource) => void;
  onReplay: (range: TimeRange, speed: number, source?: AudioSource) => void;
  onSeek: (time: number) => void;
}

const FULL_SONG_ID = "__full_song__";

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export default function SongMap({
  songId,
  songTitle,
  stemLayers,
  sections,
  chords,
  lyrics,
  tabNotes,
  profile,
  currentTime,
  isPlaying,
  currentAudioSource,
  loopStart,
  loopEnd,
  onPractice,
  onReplay,
  onSeek,
}: Props) {
  const pieces = useMemo(() => {
    return selectPrimarySongLayers(stemLayers).map<MapPiece>(
      ({ kind, layer, dedicated }) => {
        const measuredReady = layer.quality_gate_status === "ready";
        const sourceReady =
          kind === "full" && layer.quality_gate_status !== "best_available";
        const ready = sourceReady || measuredReady;
        const publiclyReady =
          ready && (kind === "full" || kind === "vocals" || dedicated);
        const qualityNote = publiclyReady
          ? null
          : !dedicated
            ? "Dedicated separation was not reliable; using the combined guitar"
            : (layer.quality_summary ??
              "Quality evidence is not available yet");
        if (kind === "full") {
          return {
            key: `full:${layer.layer_key}`,
            label: "Full Song",
            source: "full",
            kind: "overview",
            status: publiclyReady ? "Ready" : "Best available",
            qualityNote,
            downloadLayerKey: layer.layer_key,
          };
        }
        if (kind === "vocals") {
          return {
            key: `vocals:${layer.layer_key}`,
            label: "Vocals",
            source: "vocals",
            kind: "lyrics",
            status: publiclyReady ? "Ready" : "Best available",
            qualityNote,
            downloadLayerKey: layer.layer_key,
          };
        }
        return {
          key: `${kind}:${layer.layer_key}`,
          label: kind === "rhythm" ? "Rhythm Guitar" : "Lead Guitar",
          source: dedicated ? kind : "guitar",
          kind: kind === "rhythm" ? "chords" : "notes",
          status: publiclyReady ? "Ready" : "Best available",
          qualityNote,
          downloadLayerKey: layer.layer_key,
        };
      },
    );
  }, [stemLayers]);
  const fullRange = useMemo<TimeRange | null>(() => {
    if (sections.length === 0) return null;
    return {
      start: Math.min(...sections.map((section) => section.start_time)),
      end: Math.max(...sections.map((section) => section.end_time)),
    };
  }, [sections]);
  const [selectedPieceKey, setSelectedPieceKey] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    sections[0]?.id ?? null,
  );
  const defaultPiece = pieces[0] ?? null;
  const selectedPiece =
    pieces.find((piece) => piece.key === selectedPieceKey) ?? defaultPiece;
  const selectedSection =
    sections.find((section) => section.id === selectedSectionId) ??
    sections[0] ??
    null;
  const range = useMemo(
    () =>
      selectedSectionId === FULL_SONG_ID
        ? fullRange
        : selectedSection
          ? {
              start: selectedSection.start_time,
              end: selectedSection.end_time,
            }
          : null,
    [fullRange, selectedSection, selectedSectionId],
  );
  const sectionLabel =
    selectedSectionId === FULL_SONG_ID
      ? "Full song"
      : (selectedSection?.label ?? "Song");
  const tuning = getSongPracticeTuning(songId, profile.tuning_id);

  const chordChanges = useMemo(() => {
    if (!range) return [];
    return buildRhythmChordChanges(
      chords,
      range.start,
      range.end,
      profile.chord_shape_shift,
    );
  }, [chords, profile.chord_shape_shift, range]);
  const lowConfidenceChordCount = useMemo(() => {
    if (!range) return 0;
    return chords.filter(
      (chord) =>
        chord.end_time > range.start &&
        chord.start_time < range.end &&
        chord.confidence !== null &&
        chord.confidence < 0.45,
    ).length;
  }, [chords, range]);
  const verifiedChordCount = chordChanges.filter(
    (change) => change.verified,
  ).length;
  const bestGuessChordCount = chordChanges.length - verifiedChordCount;

  const leadEvidence = useMemo(() => {
    if (!range) {
      return {
        notes: [] as TabNote[],
        highConfidence: 0,
        withheld: 0,
        roleLed: false,
      };
    }
    const inRange = tabNotes.filter(
      (note) => note.start_time >= range.start && note.start_time < range.end,
    );
    const usable = inRange.filter(
      (note) => note.confidence === null || note.confidence >= 0.4,
    );
    const roleLead = usable.filter(
      (note) =>
        note.role === "lead" &&
        (note.role_confidence === null ||
          note.role_confidence === undefined ||
          note.role_confidence >= 0.6),
    );
    const roleLed = roleLead.length >= 3;
    const selected = roleLed ? roleLead : extractLeadNotes(usable);
    const positioned = positionNotesForTuning(selected, profile.tuning_offset);
    return {
      notes: positioned,
      highConfidence: positioned.filter(
        (note) => note.confidence === null || note.confidence >= 0.7,
      ).length,
      withheld: Math.max(0, inRange.length - usable.length),
      roleLed,
    };
  }, [profile.tuning_offset, range, tabNotes]);

  const playbackSelected = Boolean(
    range &&
      selectedPiece &&
      Math.abs(loopStart - range.start) < 0.05 &&
      Math.abs(loopEnd - range.end) < 0.05 &&
      currentAudioSource === selectedPiece.source,
  );
  const playbackActive = playbackSelected && isPlaying;
  const position = range
    ? playbackSelected
      ? Math.min(range.end, Math.max(range.start, currentTime))
      : range.start
    : 0;
  const progress = range
    ? ((position - range.start) / Math.max(0.001, range.end - range.start)) *
      100
    : 0;

  function selectPiece(piece: MapPiece) {
    setSelectedPieceKey(piece.key);
    if (range) onReplay(range, 1, piece.source);
  }

  function selectSection(id: string, nextRange: TimeRange) {
    setSelectedSectionId(id);
    if (selectedPiece) onReplay(nextRange, 1, selectedPiece.source);
  }

  function togglePlayback() {
    if (!range || !selectedPiece) return;
    if (playbackSelected) {
      onPractice(range, 1, selectedPiece.source);
    } else {
      onReplay(range, 1, selectedPiece.source);
    }
  }

  if (!range || !selectedPiece) {
    return (
      <section className="mx-5 my-4 border border-border-dark p-5 text-center">
        <p className="font-playfair text-[20px] italic text-text">
          Song map unavailable
        </p>
        <p className="mt-2 font-josefin text-[9px] text-text-muted">
          No synchronized song pieces were produced.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-5 mb-5 mt-3 rounded-[3px] border border-gold/35 bg-gold/[0.035] p-4">
      <div className="border-b border-border-dark pb-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-playfair text-[25px] italic leading-tight text-text">
              Song Map
            </p>
            <p className="mt-1 font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted">
              One clock · every accurate piece
            </p>
          </div>
          <p className="shrink-0 text-right font-josefin text-[7px] uppercase leading-relaxed tracking-[0.1em] text-text-dark">
            {tuning.name}
            <br />
            Original tempo
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted">
          Song section
        </p>
        <div
          className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Song sections"
        >
          {fullRange ? (
            <button
              type="button"
              onClick={() => selectSection(FULL_SONG_ID, fullRange)}
              aria-pressed={selectedSectionId === FULL_SONG_ID}
              className={`min-h-12 shrink-0 rounded-[2px] border px-3 text-left ${
                selectedSectionId === FULL_SONG_ID
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border-dark text-text-muted"
              }`}
            >
              <span className="block font-playfair text-[14px] italic">
                Full song
              </span>
              <span className="font-josefin text-[7px] tracking-[0.08em]">
                {formatTime(fullRange.start)}–{formatTime(fullRange.end)}
              </span>
            </button>
          ) : null}
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() =>
                selectSection(section.id, {
                  start: section.start_time,
                  end: section.end_time,
                })
              }
              aria-pressed={selectedSection?.id === section.id}
              className={`min-h-12 shrink-0 rounded-[2px] border px-3 text-left ${
                selectedSection?.id === section.id &&
                selectedSectionId !== FULL_SONG_ID
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border-dark text-text-muted"
              }`}
            >
              <span className="block font-playfair text-[14px] italic">
                {section.label}
              </span>
              <span className="font-josefin text-[7px] tracking-[0.08em]">
                {formatTime(section.start_time)}–{formatTime(section.end_time)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted">
          Choose a layer
        </p>
        <div
          className="grid grid-cols-2 gap-2"
          aria-label="Synchronized song pieces"
        >
          {pieces.map((piece) => (
            <button
              key={piece.key}
              type="button"
              onClick={() => selectPiece(piece)}
              aria-pressed={selectedPiece.key === piece.key}
              className={`min-h-12 rounded-[2px] border px-3 text-left ${
                selectedPiece.key === piece.key
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border-dark text-text-muted"
              }`}
            >
              <span className="block font-playfair text-[14px] italic">
                {piece.label}
              </span>
              <span className="font-josefin text-[7px] uppercase tracking-[0.08em] text-text-dark">
                {piece.status}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 border-y border-border-dark py-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-playfair text-[20px] italic text-text">
              {selectedPiece.label}
            </p>
            <p className="mt-1 font-josefin text-[8px] uppercase tracking-[0.1em] text-gold/80">
              {sectionLabel} · {formatTime(range.start)}–{formatTime(range.end)}
            </p>
          </div>
          <p className="font-josefin text-[9px] tabular-nums text-text-muted">
            {formatTime(position)}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-[1.35fr_1fr] gap-2">
          <button
            type="button"
            onClick={togglePlayback}
            aria-pressed={playbackActive}
            className="min-h-12 rounded-[2px] border border-gold bg-gold/10 px-3 font-josefin text-[9px] uppercase tracking-[0.13em] text-gold"
          >
            {playbackActive ? "Pause" : "Play selection"}
          </button>
          <SelectionDownloadButton
            key={`${selectedPiece.downloadLayerKey}:${range.start}:${range.end}`}
            songId={songId}
            songTitle={songTitle}
            layerKey={selectedPiece.downloadLayerKey}
            pieceLabel={selectedPiece.label}
            sectionLabel={sectionLabel}
            start={range.start}
            end={range.end}
          />
        </div>
        {selectedPiece.qualityNote ? (
          <p className="mt-2 font-josefin text-[7px] uppercase leading-relaxed tracking-[0.08em] text-text-dark">
            Best available · {selectedPiece.qualityNote}
          </p>
        ) : null}
        <div
          className="mt-3 h-px overflow-hidden bg-border-dark"
          role="progressbar"
          aria-label={`${selectedPiece.label} playback progress`}
          aria-valuemin={range.start}
          aria-valuemax={range.end}
          aria-valuenow={position}
        >
          <div
            className="h-full bg-gold transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {selectedPiece.kind === "chords" ? (
        <div className="mt-4">
          <div className="flex items-end justify-between gap-3">
            <p className="font-playfair text-[18px] italic text-text">
              Chord changes
            </p>
            <p className="text-right font-josefin text-[7px] uppercase tracking-[0.08em] text-text-dark">
              {verifiedChordCount} verified · {bestGuessChordCount} best guess
              {lowConfidenceChordCount > 0
                ? ` · ${lowConfidenceChordCount} withheld`
                : ""}
            </p>
          </div>
          <RhythmChordFlow
            changes={chordChanges}
            start={range.start}
            end={range.end}
            currentTime={currentTime}
            onSeek={onSeek}
          />
        </div>
      ) : null}

      {selectedPiece.kind === "notes" ? (
        <div className="mt-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <p className="font-playfair text-[18px] italic text-text">
              Lead notes
            </p>
            <p className="text-right font-josefin text-[7px] uppercase tracking-[0.08em] text-text-dark">
              {leadEvidence.highConfidence} strong · {leadEvidence.notes.length}{" "}
              shown
              {leadEvidence.withheld > 0
                ? ` · ${leadEvidence.withheld} withheld`
                : ""}
            </p>
          </div>
          {leadEvidence.notes.length > 0 ? (
            <SoloPhraseTab
              notes={leadEvidence.notes}
              range={range}
              strings={tuning.strings}
              currentTime={currentTime}
              expanded
              onSeek={onSeek}
            />
          ) : (
            <p className="border-y border-border-dark py-5 text-center font-josefin text-[9px] text-text-muted">
              No usable lead notes survived the quality gate in this section.
            </p>
          )}
          <p className="mt-2 font-josefin text-[7px] uppercase tracking-[0.08em] text-text-darkest">
            {leadEvidence.roleLed
              ? "Lead role isolated from the guitar signal"
              : "Best available melodic line · not independently verified"}
          </p>
        </div>
      ) : null}

      {selectedPiece.kind === "lyrics" ? (
        <SyncedLyrics
          lyrics={lyrics}
          currentTime={currentTime}
          range={range}
          chords={chords}
          chordShapeShift={profile.chord_shape_shift}
          onSeek={onSeek}
        />
      ) : null}

      {selectedPiece.kind === "overview" || selectedPiece.kind === "audio" ? (
        <div className="mt-4 border-t border-border-dark pt-4">
          <p className="font-josefin text-[8px] uppercase tracking-[0.11em] text-text-muted">
            Audio piece only
          </p>
          <p className="mt-2 font-josefin text-[9px] leading-relaxed text-text-dark">
            Notation stays on Lead Guitar, Rhythm Guitar, and Vocals so signals
            are never mixed into a misleading map.
          </p>
        </div>
      ) : null}

    </section>
  );
}
