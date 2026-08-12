"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Spinner from "@/components/Spinner";
import type {
  Chord,
  PracticeProfile,
  Section,
  Song,
  Stem,
  StemLayer,
  TabNote,
} from "@/lib/database.types";
import LearnMode from "./_components/LearnMode";
import {
  getPracticeTuning,
  type PracticeTuningId,
} from "@/lib/guitar";

type PracticeRange = {
  start: number;
  end: number;
};

type AudioSource = "guitar" | "bass" | "backing" | "full";

function defaultPracticeProfile(songId: string): PracticeProfile {
  const tuning = getPracticeTuning("standard");
  return {
    song_id: songId,
    tuning_id: tuning.id,
    tuning_name: tuning.name,
    tuning_offset: tuning.offset,
    chord_shape_shift: tuning.chordShapeShift,
    tab_confidence_threshold: 0.6,
    source: "default",
    updated_at: 0,
  };
}

export default function SongPlayerPage() {
  const { id: songId } = useParams<{ id: string }>();

  const [song, setSong] = useState<Song | null>(null);
  const [stems, setStems] = useState<Stem | null>(null);
  const [stemLayers, setStemLayers] = useState<StemLayer[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [chords, setChords] = useState<Chord[]>([]);
  const [tabNotes, setTabNotes] = useState<TabNote[]>([]);
  const [practiceProfile, setPracticeProfile] = useState<PracticeProfile>(() =>
    defaultPracticeProfile(songId),
  );
  const [profileSaveState, setProfileSaveState] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [loading, setLoading] = useState(true);

  const [stemMode, setStemMode] = useState<AudioSource>("guitar");
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [practiceRange, setPracticeRange] = useState<PracticeRange | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioGroupRef = useRef<HTMLAudioElement[]>([]);
  const animFrameRef = useRef<number>(0);

  // Fetch the full song bundle once, then use the lightweight status endpoint
  // while processing. Refresh the large chord/tab payload only when a stage
  // transition can have changed the playable stems.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastStage: string | null = null;

    async function fetchBundle() {
      try {
        const res = await fetch(`/api/songs/${songId}`, { cache: "no-store" });
        if (!res.ok || cancelled) return null;
        const data = await res.json();
        if (cancelled) return null;
        lastStage = data.song?.processing_stage ?? null;
        setSong(data.song);
        setStems(data.stems);
        setStemLayers(data.stem_layers || []);
        setSections(data.sections || []);
        setChords(data.chords || []);
        setTabNotes(data.tab_notes || []);
        setPracticeProfile(
          data.practice_profile || defaultPracticeProfile(songId),
        );
        if (data.sections?.length > 0) {
          setPracticeRange((current) =>
            current ?? {
              start: data.sections[0].start_time,
              end: data.sections[0].end_time,
            },
          );
        }
        return (data.song?.status as string | undefined) ?? null;
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function pollStatus() {
      let keepPolling = true;
      try {
        const res = await fetch(`/api/songs/${songId}/status`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const status = await res.json();
        if (cancelled) return;

        const stageChanged = status.processing_stage !== lastStage;
        setSong((current) =>
          current
            ? {
                ...current,
                status: status.status,
                processing_stage: status.processing_stage,
                last_error: status.last_error,
                updated_at: status.updated_at,
              }
            : current,
        );

        lastStage = status.processing_stage;
        if (stageChanged || status.status === "ready") {
          await fetchBundle();
        }

        if (status.status === "ready" || status.status === "failed") {
          keepPolling = false;
        }
      } finally {
        if (!cancelled && keepPolling) timer = setTimeout(pollStatus, 3000);
      }
    }

    void (async () => {
      const initialStatus = await fetchBundle();
      if (
        !cancelled &&
        (initialStatus === "queued" || initialStatus === "processing")
      ) {
        timer = setTimeout(pollStatus, 3000);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [songId]);

  const audioUrls = useMemo(() => {
    if (stemMode === "guitar") return stems?.guitar_url ? [stems.guitar_url] : [];
    if (stemMode === "bass") return stems?.bass_url ? [stems.bass_url] : [];
    if (stemMode === "full") return stems?.original_url ? [stems.original_url] : [];
    return [stems?.vocals_url, stems?.drums_url, stems?.bass_url].filter(
      (url): url is string => Boolean(url),
    );
  }, [stemMode, stems]);

  // Carries position + play state across stem switches so changing stems
  // doesn't restart the song.
  const resumeRef = useRef<{ time: number; playing: boolean }>({
    time: 0,
    playing: false,
  });
  const pendingLessonPlaybackRef = useRef<{
    time: number;
    playing: boolean;
  } | null>(null);

  // A backing track is a synchronized group of vocals, drums, and bass.
  // Other sources remain a one-element group and use the same transport.
  useEffect(() => {
    if (audioUrls.length === 0) return;
    const audios = audioUrls.map((url) => {
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.playbackRate = speed;
      audio.volume = stemMode === "backing" ? 0.72 : 1;
      // Slowing down must not drop the pitch — this is a practice tool.
      audio.preservesPitch = true;
      return audio;
    });
    const leader = audios[0];
    audioRef.current = leader;
    audioGroupRef.current = audios;

    const resume = resumeRef.current;
    let readyCount = 0;
    const onLoaded = () => {
      readyCount += 1;
      if (readyCount < audios.length) return;
      if (resume.time > 0 && resume.time < leader.duration) {
        for (const audio of audios) audio.currentTime = resume.time;
        setCurrentTime(resume.time);
      }
      if (resume.playing) {
        void Promise.all(audios.map((audio) => audio.play())).then(
          () => setIsPlaying(true),
          () => setIsPlaying(false),
        );
      }
    };
    const onEnded = () => setIsPlaying(false);
    for (const audio of audios) {
      audio.addEventListener("loadedmetadata", onLoaded);
    }
    leader.addEventListener("ended", onEnded);

    return () => {
      resumeRef.current = pendingLessonPlaybackRef.current ?? {
        time: leader.currentTime,
        playing: !leader.paused,
      };
      pendingLessonPlaybackRef.current = null;
      for (const audio of audios) {
        audio.removeEventListener("loadedmetadata", onLoaded);
        audio.pause();
        audio.src = "";
      }
      leader.removeEventListener("ended", onEnded);
      audioRef.current = null;
      audioGroupRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrls]);

  useEffect(() => {
    for (const audio of audioGroupRef.current) audio.playbackRate = speed;
  }, [speed]);

  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const max =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : time;
    const clamped = Math.max(0, Math.min(time, max));
    for (const track of audioGroupRef.current) track.currentTime = clamped;
    setCurrentTime(clamped);
  }, []);

  const loopStart = practiceRange?.start ?? 0;
  const loopEnd = practiceRange?.end ?? Number.POSITIVE_INFINITY;

  // One learning pipeline means one playback model: the chosen phrase loops
  // at exactly the source and speed the learner selected.
  const updateTime = useCallback(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    const now = audio.currentTime;
    setCurrentTime(now);

    if (loopEnd > loopStart && now >= loopEnd) {
      for (const track of audioGroupRef.current) track.currentTime = loopStart;
      setCurrentTime(loopStart);
    } else if (audioGroupRef.current.length > 1) {
      for (const track of audioGroupRef.current.slice(1)) {
        if (Math.abs(track.currentTime - now) > 0.08) track.currentTime = now;
      }
    }

    if (isPlaying) animFrameRef.current = requestAnimationFrame(updateTime);
  }, [isPlaying, loopEnd, loopStart]);

  useEffect(() => {
    if (isPlaying) animFrameRef.current = requestAnimationFrame(updateTime);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, updateTime]);

  async function handleTuningChange(tuningId: PracticeTuningId) {
    if (tuningId === practiceProfile.tuning_id) return;
    const previous = practiceProfile;
    const tuning = getPracticeTuning(tuningId);
    setPracticeProfile({
      ...previous,
      tuning_id: tuning.id,
      tuning_name: tuning.name,
      tuning_offset: tuning.offset,
      chord_shape_shift: tuning.chordShapeShift,
      source: "manual",
    });
    setProfileSaveState("saving");
    try {
      const response = await fetch(`/api/songs/${songId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tuning_id: tuningId }),
      });
      if (!response.ok) throw new Error("Failed to save tuning");
      setPracticeProfile((await response.json()) as PracticeProfile);
      setProfileSaveState("idle");
    } catch {
      setPracticeProfile(previous);
      setProfileSaveState("error");
    }
  }

  function resolveAudioSource(requestedSource: AudioSource): AudioSource {
    if (requestedSource === "guitar" && !stems?.guitar_url) return "full";
    if (requestedSource === "bass" && !stems?.bass_url) return "full";
    if (
      requestedSource === "backing" &&
      (!stems?.vocals_url || !stems?.drums_url || !stems?.bass_url)
    ) {
      return "full";
    }
    return requestedSource;
  }

  function pauseAudioGroup() {
    for (const audio of audioGroupRef.current) audio.pause();
  }

  function playAudioGroup() {
    return Promise.all(audioGroupRef.current.map((audio) => audio.play()));
  }

  function playLessonRange(
    range: PracticeRange,
    nextSpeed: number,
    requestedSource: AudioSource = "guitar",
  ) {
    const audio = audioRef.current;
    if (!audio) return;

    const nextSource = resolveAudioSource(requestedSource);

    setPracticeRange(range);
    setSpeed(nextSpeed);
    for (const track of audioGroupRef.current) {
      track.currentTime = range.start;
      track.playbackRate = nextSpeed;
    }
    setCurrentTime(range.start);

    if (stemMode !== nextSource) {
      pauseAudioGroup();
      pendingLessonPlaybackRef.current = {
        time: range.start,
        playing: true,
      };
      setIsPlaying(false);
      setStemMode(nextSource);
      return;
    }

    void playAudioGroup().then(
      () => setIsPlaying(true),
      () => setIsPlaying(false),
    );
  }

  function handleBeforeTunerStart() {
    pauseAudioGroup();
    setIsPlaying(false);
  }

  function handleLessonPractice(
    range: PracticeRange,
    nextSpeed: number,
    requestedSource: AudioSource = "guitar",
  ) {
    const nextSource = resolveAudioSource(requestedSource);
    const sameRange =
      Math.abs(loopStart - range.start) < 0.05 &&
      Math.abs(loopEnd - range.end) < 0.05;
    if (isPlaying && sameRange && stemMode === nextSource) {
      pauseAudioGroup();
      setIsPlaying(false);
      return;
    }
    playLessonRange(range, nextSpeed, nextSource);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  if (!song) {
    return (
      <div className="flex-1 p-6">
        <p className="font-josefin text-[12px] font-thin text-text-muted">
          Song not found.
        </p>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-hidden">
      {song.status !== "ready" && (
        <div className="border-b border-border-darkest px-5 py-2 font-josefin text-[9px] uppercase tracking-[0.14em] text-orange">
          Preview playing · refining high-quality stems
        </div>
      )}
      <LearnMode
        stemLayers={stemLayers}
        sections={sections}
        chords={chords}
        notes={tabNotes}
        bpm={song.bpm}
        hasGuitarStem={Boolean(stems?.guitar_url)}
        hasBassStem={Boolean(stems?.bass_url)}
        hasBackingTrack={Boolean(
          stems?.vocals_url && stems?.drums_url && stems?.bass_url,
        )}
        profile={practiceProfile}
        currentTime={currentTime}
        isPlaying={isPlaying}
        currentSpeed={speed}
        currentAudioSource={stemMode}
        loopStart={loopStart}
        loopEnd={loopEnd}
        savingTuning={profileSaveState === "saving"}
        tuningSaveError={profileSaveState === "error"}
        onTuningChange={handleTuningChange}
        onPractice={handleLessonPractice}
        onReplay={playLessonRange}
        onSeek={seekTo}
        onPause={handleBeforeTunerStart}
        onBeforeTunerStart={handleBeforeTunerStart}
      />
    </main>
  );
}
