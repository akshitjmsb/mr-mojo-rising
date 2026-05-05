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
} from "@/lib/database.types";
import StemSelector, { type StemMode } from "./_components/StemSelector";
import type { DownloadStemKey } from "./_components/DownloadPanel";
import Scrubber from "./_components/Scrubber";
import TransportControls from "./_components/TransportControls";
import SpeedPresets from "./_components/SpeedPresets";
import { useMetronome } from "./_hooks/useMetronome";

// Heavy or interaction-on-demand panels — split out of the initial bundle.
const Waveform = dynamic(() => import("./_components/Waveform"), {
  loading: () => <div className="h-[60px] px-5 pt-4 pb-2" />,
});
const DownloadPanel = dynamic(() => import("./_components/DownloadPanel"));
const ChordLyricsPanel = dynamic(
  () => import("./_components/ChordLyricsPanel"),
);
const SectionList = dynamic(() => import("./_components/SectionList"));

const SEEK_STEP_SECONDS = 10;

export default function SongPlayerPage() {
  const { id: songId } = useParams<{ id: string }>();

  const [song, setSong] = useState<Song | null>(null);
  const [stems, setStems] = useState<Stem | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [chords, setChords] = useState<Chord[]>([]);
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [loading, setLoading] = useState(true);

  const [stemMode, setStemMode] = useState<StemMode>("guitar");
  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [speed, setSpeed] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [metronomeOn, setMetronomeOn] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number>(0);

  // Fetch the full song bundle in one round trip.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/songs/${songId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setSong(data.song);
        setStems(data.stems);
        setSections(data.sections || []);
        setChords(data.chords || []);
        setLyrics(data.lyrics || null);
        if (data.sections?.length > 0) setActiveSection(data.sections[0]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [songId]);

  const audioUrl =
    stemMode === "guitar"
      ? stems?.guitar_url
      : stemMode === "vocals"
        ? stems?.vocals_url
        : stems?.original_url;

  // Wire up the audio element when the source changes.
  useEffect(() => {
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audio.playbackRate = speed;
    audioRef.current = audio;

    const onLoaded = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);

    return () => {
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

  // Drive currentTime + section sync + section looping from a single rAF loop.
  const updateTime = useCallback(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    const now = audio.currentTime;
    setCurrentTime(now);
    const section = syncActiveSectionWithTime(now);

    if (section && isLooping && now >= section.end_time) {
      audio.currentTime = section.start_time;
      setCurrentTime(section.start_time);
    }

    if (isPlaying) animFrameRef.current = requestAnimationFrame(updateTime);
  }, [isPlaying, isLooping, syncActiveSectionWithTime]);

  useEffect(() => {
    if (isPlaying) animFrameRef.current = requestAnimationFrame(updateTime);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, updateTime]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      setMetronomeOn(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  function handleSelectSection(section: Section) {
    setActiveSection(section);
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
      <StemSelector value={stemMode} onChange={setStemMode} />
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
        togglePlay={togglePlay}
        toggleLoop={() => setIsLooping((v) => !v)}
        toggleMetronome={() => setMetronomeOn((v) => !v)}
        rewind={rewind}
        forward={forward}
        seekStepSeconds={SEEK_STEP_SECONDS}
      />
      <SpeedPresets value={speed} onChange={setSpeed} />
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
