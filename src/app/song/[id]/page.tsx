"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Spinner from "@/components/Spinner";
import type {
  Chord,
  Lyrics,
  Section,
  Song,
  Stem,
  TabNote,
} from "@/lib/database.types";
import StemSelector, { type StemMode } from "./_components/StemSelector";
import type { DownloadStemKey } from "./_components/DownloadPanel";
import Scrubber from "./_components/Scrubber";
import TransportControls from "./_components/TransportControls";
import SpeedPresets from "./_components/SpeedPresets";
import PhraseTrainer from "./_components/PhraseTrainer";
import { useCountIn } from "./_hooks/useCountIn";
import { useMetronome } from "./_hooks/useMetronome";

// Heavy or interaction-on-demand panels — split out of the initial bundle.
const Waveform = dynamic(() => import("./_components/Waveform"), {
  loading: () => <div className="h-[60px] px-5 pt-4 pb-2" />,
});
const DownloadPanel = dynamic(() => import("./_components/DownloadPanel"));
const ChordLyricsPanel = dynamic(
  () => import("./_components/ChordLyricsPanel"),
);
const TabPanel = dynamic(() => import("./_components/TabPanel"));
const SectionList = dynamic(() => import("./_components/SectionList"));

const SEEK_STEP_SECONDS = 10;
const TRAINER_PREFS_KEY = "mr-mojo:phrase-trainer:v1";
const REPETITIONS_PER_STEP = 3;
const SPEED_STEP = 0.05;
const MAX_TRAINER_SPEED = 1;

type PracticeRange = {
  start: number;
  end: number;
};

export default function SongPlayerPage() {
  const { id: songId } = useParams<{ id: string }>();

  const [song, setSong] = useState<Song | null>(null);
  const [stems, setStems] = useState<Stem | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [chords, setChords] = useState<Chord[]>([]);
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [tabNotes, setTabNotes] = useState<TabNote[]>([]);
  const [loading, setLoading] = useState(true);

  const [stemMode, setStemMode] = useState<StemMode>("guitar");
  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [speed, setSpeed] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [practiceRange, setPracticeRange] = useState<PracticeRange | null>(null);
  const [completedLoops, setCompletedLoops] = useState(0);
  const [countInEnabled, setCountInEnabled] = useState(true);
  const [autoRampEnabled, setAutoRampEnabled] = useState(true);
  const [bestPracticeSpeed, setBestPracticeSpeed] = useState(0);
  const [trainerPrefsLoaded, setTrainerPrefsLoaded] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const completedLoopsRef = useRef(0);
  const countInVolumeRef = useRef<number | null>(null);

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
        setSections(data.sections || []);
        setChords(data.chords || []);
        setLyrics(data.lyrics || null);
        setTabNotes(data.tab_notes || []);
        if (data.sections?.length > 0) {
          setActiveSection((current) => current ?? data.sections[0]);
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

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TRAINER_PREFS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          countInEnabled?: boolean;
          autoRampEnabled?: boolean;
        };
        if (typeof parsed.countInEnabled === "boolean") {
          setCountInEnabled(parsed.countInEnabled);
        }
        if (typeof parsed.autoRampEnabled === "boolean") {
          setAutoRampEnabled(parsed.autoRampEnabled);
        }
      }

      const savedProgress = localStorage.getItem(
        `mr-mojo:phrase-progress:v1:${songId}`,
      );
      if (savedProgress) {
        const parsed = JSON.parse(savedProgress) as {
          bestPracticeSpeed?: number;
        };
        if (
          typeof parsed.bestPracticeSpeed === "number" &&
          Number.isFinite(parsed.bestPracticeSpeed)
        ) {
          setBestPracticeSpeed(parsed.bestPracticeSpeed);
        }
      }
    } catch {
      // Storage can be unavailable; the trainer still works for this session.
    } finally {
      setTrainerPrefsLoaded(true);
    }
  }, [songId]);

  useEffect(() => {
    if (!trainerPrefsLoaded) return;
    try {
      localStorage.setItem(
        TRAINER_PREFS_KEY,
        JSON.stringify({ countInEnabled, autoRampEnabled }),
      );
    } catch {
      // Ignore unavailable storage.
    }
  }, [autoRampEnabled, countInEnabled, trainerPrefsLoaded]);

  useEffect(() => {
    if (!trainerPrefsLoaded || bestPracticeSpeed <= 0) return;
    try {
      localStorage.setItem(
        `mr-mojo:phrase-progress:v1:${songId}`,
        JSON.stringify({ bestPracticeSpeed }),
      );
    } catch {
      // Ignore unavailable storage.
    }
  }, [bestPracticeSpeed, songId, trainerPrefsLoaded]);

  const audioUrl =
    stemMode === "guitar"
      ? stems?.guitar_url
      : stemMode === "bass"
        ? stems?.bass_url
        : stemMode === "vocals"
          ? stems?.vocals_url
          : stems?.original_url;

  // Carries position + play state across stem switches so changing stems
  // doesn't restart the song.
  const resumeRef = useRef<{ time: number; playing: boolean }>({
    time: 0,
    playing: false,
  });

  const finishCountIn = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = practiceRange?.start ?? activeSection?.start_time ?? 0;
    if (countInVolumeRef.current !== null) {
      audio.volume = countInVolumeRef.current;
      countInVolumeRef.current = null;
    }
    void audio.play().then(
      () => setIsPlaying(true),
      () => setIsPlaying(false),
    );
  }, [activeSection, practiceRange]);

  const {
    beat: countInBeat,
    isCountingIn,
    start: startCountIn,
    cancel: cancelCountIn,
  } = useCountIn({ bpm: song?.bpm, speed, onComplete: finishCountIn });

  const cancelCountInPlayback = useCallback(() => {
    cancelCountIn();
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    if (countInVolumeRef.current !== null) {
      audio.volume = countInVolumeRef.current;
      countInVolumeRef.current = null;
    }
    setIsPlaying(false);
  }, [cancelCountIn]);

  // Wire up the audio element when the source changes.
  useEffect(() => {
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audio.playbackRate = speed;
    // Slowing down must not drop the pitch — this is a practice tool.
    audio.preservesPitch = true;
    audioRef.current = audio;

    const resume = resumeRef.current;
    const onLoaded = () => {
      setDuration(audio.duration);
      if (resume.time > 0 && resume.time < audio.duration) {
        audio.currentTime = resume.time;
        setCurrentTime(resume.time);
      }
      if (resume.playing) {
        audio.play().catch(() => setIsPlaying(false));
        setIsPlaying(true);
      }
    };
    const onEnded = () => setIsPlaying(false);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);

    return () => {
      resumeRef.current = { time: audio.currentTime, playing: !audio.paused };
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  const findSectionForTime = useCallback(
    (time: number): Section | null => {
      if (sections.length === 0) return null;
      const match = sections.find(
        (s) => time >= s.start_time && time < s.end_time,
      );
      if (match) return match;
      if (time >= sections[sections.length - 1].end_time)
        return sections[sections.length - 1];
      return sections[0];
    },
    [sections],
  );

  const syncActiveSectionWithTime = useCallback(
    (time: number) => {
      const section = findSectionForTime(time);
      if (section && section.id !== activeSection?.id) {
        setActiveSection(section);
      }
      return section;
    },
    [activeSection?.id, findSectionForTime],
  );

  const seekTo = useCallback(
    (time: number) => {
      if (!audioRef.current) return;
      const audio = audioRef.current;
      const max =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : duration;
      const clamped = Math.max(0, Math.min(time, max || 0));
      audio.currentTime = clamped;
      setCurrentTime(clamped);
      syncActiveSectionWithTime(clamped);
    },
    [duration, syncActiveSectionWithTime],
  );

  const seekBy = useCallback(
    (seconds: number) => {
      if (!audioRef.current) return;
      seekTo(audioRef.current.currentTime + seconds);
    },
    [seekTo],
  );

  const rewind = useCallback(() => seekBy(-SEEK_STEP_SECONDS), [seekBy]);
  const forward = useCallback(() => seekBy(SEEK_STEP_SECONDS), [seekBy]);

  const loopStart =
    practiceRange?.start ?? activeSection?.start_time ?? 0;
  const loopEnd =
    practiceRange?.end ?? activeSection?.end_time ?? duration;

  const resetLoopProgress = useCallback(() => {
    completedLoopsRef.current = 0;
    setCompletedLoops(0);
  }, []);

  // Drive currentTime, section sync, phrase looping and automatic speed
  // progression from a single animation-frame loop.
  const updateTime = useCallback(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    const now = audio.currentTime;
    setCurrentTime(now);
    syncActiveSectionWithTime(now);

    if (isLooping && loopEnd > loopStart && now >= loopEnd) {
      audio.currentTime = loopStart;
      setCurrentTime(loopStart);

      const nextLoopCount = completedLoopsRef.current + 1;
      completedLoopsRef.current = nextLoopCount;
      setCompletedLoops(nextLoopCount);
      setBestPracticeSpeed((current) => Math.max(current, speed));

      if (
        autoRampEnabled &&
        nextLoopCount % REPETITIONS_PER_STEP === 0 &&
        speed < MAX_TRAINER_SPEED
      ) {
        setSpeed((current) =>
          Math.min(
            MAX_TRAINER_SPEED,
            Math.round((current + SPEED_STEP) * 100) / 100,
          ),
        );
      }
    }

    if (isPlaying) animFrameRef.current = requestAnimationFrame(updateTime);
  }, [
    autoRampEnabled,
    isPlaying,
    isLooping,
    loopEnd,
    loopStart,
    speed,
    syncActiveSectionWithTime,
  ]);

  useEffect(() => {
    if (isPlaying) animFrameRef.current = requestAnimationFrame(updateTime);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, updateTime]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isCountingIn) {
      cancelCountInPlayback();
      return;
    }
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      setMetronomeOn(false);
    } else {
      if (currentTime < loopStart || currentTime >= loopEnd) {
        audio.currentTime = loopStart;
        setCurrentTime(loopStart);
      }

      if (countInEnabled && song?.bpm) {
        countInVolumeRef.current = audio.volume;
        audio.volume = 0;
        audio.currentTime = loopStart;
        void audio.play().catch(() => {
          cancelCountInPlayback();
        });
        startCountIn();
      } else {
        void audio.play().then(
          () => setIsPlaying(true),
          () => setIsPlaying(false),
        );
      }
    }
  }, [
    cancelCountInPlayback,
    countInEnabled,
    currentTime,
    isCountingIn,
    isPlaying,
    loopEnd,
    loopStart,
    song?.bpm,
    startCountIn,
  ]);

  function snapToBeat(time: number) {
    if (!song?.bpm) return time;
    const beatDuration = 60 / song.bpm;
    return Math.round(time / beatDuration) * beatDuration;
  }

  function handleSetLoopStart() {
    const minimumPhrase = song?.bpm ? 60 / song.bpm : 0.5;
    const start = Math.max(0, snapToBeat(currentTime));
    if (start > loopEnd - minimumPhrase) return;
    setPracticeRange({ start, end: loopEnd });
    resetLoopProgress();
  }

  function handleSetLoopEnd() {
    const minimumPhrase = song?.bpm ? 60 / song.bpm : 0.5;
    const end = Math.min(
      duration || Number.POSITIVE_INFINITY,
      snapToBeat(currentTime),
    );
    if (end < loopStart + minimumPhrase) return;
    setPracticeRange({ start: loopStart, end });
    resetLoopProgress();
  }

  function handleResetPracticeRange() {
    if (!activeSection) return;
    setPracticeRange({
      start: activeSection.start_time,
      end: activeSection.end_time,
    });
    resetLoopProgress();
  }

  function handleSpeedChange(nextSpeed: number) {
    setSpeed(nextSpeed);
    resetLoopProgress();
  }

  function handleStemModeChange(nextMode: StemMode) {
    if (isCountingIn) cancelCountInPlayback();
    setStemMode(nextMode);
  }

  function handleSelectSection(section: Section) {
    if (isCountingIn) cancelCountInPlayback();
    setActiveSection(section);
    setPracticeRange({ start: section.start_time, end: section.end_time });
    resetLoopProgress();
    if (audioRef.current) {
      audioRef.current.currentTime = section.start_time;
      setCurrentTime(section.start_time);
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  }

  // Keyboard shortcuts: ←/→ seek, space toggles play.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        rewind();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        forward();
      } else if (event.key === " ") {
        event.preventDefault();
        togglePlay();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [forward, rewind, togglePlay]);

  useMetronome({ enabled: metronomeOn, bpm: song?.bpm, speed });

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

  const currentDownloadStem: DownloadStemKey =
    stemMode === "full" ? "full" : stemMode;

  return (
    <main className="flex-1 overflow-hidden">
      {song.status !== "ready" && (
        <div className="border-b border-border-darkest px-5 py-2 font-josefin text-[9px] uppercase tracking-[0.14em] text-orange">
          Preview playing · refining high-quality stems
        </div>
      )}
      <StemSelector value={stemMode} onChange={handleStemModeChange} />
      <DownloadPanel
        songId={songId}
        stems={stems}
        songTitle={song.title}
        currentStem={currentDownloadStem}
      />
      <Waveform
        sections={sections}
        currentTime={currentTime}
        duration={duration}
      />
      <Scrubber
        activeSection={activeSection}
        currentTime={currentTime}
        duration={duration}
        seekTo={seekTo}
      />
      <TransportControls
        isPlaying={isPlaying}
        isLooping={isLooping}
        metronomeOn={metronomeOn}
        bpm={song.bpm}
        speed={speed}
        countInBeat={countInBeat}
        togglePlay={togglePlay}
        toggleLoop={() => {
          setIsLooping((value) => !value);
          resetLoopProgress();
        }}
        toggleMetronome={() => setMetronomeOn((v) => !v)}
        rewind={rewind}
        forward={forward}
        seekStepSeconds={SEEK_STEP_SECONDS}
      />
      <SpeedPresets value={speed} onChange={handleSpeedChange} />
      {tabNotes.length > 0 && loopEnd > loopStart && (
        <PhraseTrainer
          loopStart={loopStart}
          loopEnd={loopEnd}
          bpm={song.bpm}
          speed={speed}
          completedLoops={completedLoops}
          repetitionsPerStep={REPETITIONS_PER_STEP}
          bestPracticeSpeed={bestPracticeSpeed}
          countInEnabled={countInEnabled}
          autoRampEnabled={autoRampEnabled}
          onSetStart={handleSetLoopStart}
          onSetEnd={handleSetLoopEnd}
          onResetRange={handleResetPracticeRange}
          onToggleCountIn={() => {
            if (isCountingIn) cancelCountInPlayback();
            setCountInEnabled((value) => !value);
          }}
          onToggleAutoRamp={() => setAutoRampEnabled((value) => !value)}
        />
      )}
      <TabPanel
        notes={tabNotes}
        currentTime={currentTime}
        duration={duration}
        bpm={song.bpm}
        loopStart={loopStart}
        loopEnd={loopEnd}
        seekTo={seekTo}
      />
      <ChordLyricsPanel
        chords={chords}
        lyrics={lyrics}
        currentTime={currentTime}
      />
      <SectionList
        sections={sections}
        activeSection={activeSection}
        onSelect={handleSelectSection}
      />
    </main>
  );
}
