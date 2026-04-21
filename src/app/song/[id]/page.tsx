"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Header from "@/components/Header";
import TabNav from "@/components/TabNav";
import Footer from "@/components/Footer";
import { parseLrc, findCurrentLineIndex } from "@/lib/lrc-parser";
import type { Database } from "@/lib/database.types";

type Song = Database["public"]["Tables"]["songs"]["Row"];
type Stem = Database["public"]["Tables"]["stems"]["Row"];
type Section = Database["public"]["Tables"]["sections"]["Row"];
type Chord = Database["public"]["Tables"]["chords"]["Row"];
type Lyrics = Database["public"]["Tables"]["lyrics"]["Row"];

const SECTION_COLORS: Record<string, string> = {
  Intro: "#D4A844",
  "Verse I": "#C8844A",
  "Verse II": "#C8844A",
  "Verse III": "#C8844A",
  Chorus: "#B85C3A",
  Break: "#8A6A9A",
  Bridge: "#8A6A9A",
  Solo: "#D4A844",
  Outro: "#D4A844",
};

function getSectionColor(label: string): string {
  return SECTION_COLORS[label] || "#C8844A";
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const SPEEDS = [
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "Full", value: 1.0 },
];
const SEEK_STEP_SECONDS = 10;
type DownloadStemKey = "full" | "guitar" | "vocals" | "drums" | "bass";

export default function SongPlayerPage() {
  const params = useParams();
  const songId = params.id as string;

  const [song, setSong] = useState<Song | null>(null);
  const [stems, setStems] = useState<Stem | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [chords, setChords] = useState<Chord[]>([]);
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [loading, setLoading] = useState(true);

  const [stemMode, setStemMode] = useState<"guitar" | "vocals" | "full">("guitar");
  const [showPanel, setShowPanel] = useState(false);
  const [lyricsOffset, setLyricsOffset] = useState(0); // seconds, + = lyrics earlier, - = lyrics later
  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [speed, setSpeed] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [downloadingStem, setDownloadingStem] = useState<DownloadStemKey | null>(null);
  const [downloadError, setDownloadError] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionProgressRef = useRef<HTMLDivElement | null>(null);
  const isScrubbingRef = useRef(false);
  const downloadLockRef = useRef(false);

  // Metronome
  const [metronomeOn, setMetronomeOn] = useState(false);
  const metronomeRef = useRef<{
    ctx: AudioContext;
    nextBeatTime: number;
    beatInterval: number;
    timerId: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  // Fetch song data
  useEffect(() => {
    async function fetchSong() {
      try {
        const res = await fetch(`/api/songs/${songId}`);
        if (!res.ok) return;
        const data = await res.json();
        setSong(data.song);
        setStems(data.stems);
        setSections(data.sections || []);
        setChords(data.chords || []);
        setLyrics(data.lyrics || null);
        if (data.sections?.length > 0) {
          setActiveSection(data.sections[0]);
        }
      } catch {
        // Song not found
      } finally {
        setLoading(false);
      }
    }
    fetchSong();
  }, [songId]);

  // Audio source URL
  const audioUrl =
    stemMode === "guitar" ? stems?.guitar_url :
    stemMode === "vocals" ? stems?.vocals_url :
    stems?.original_url;

  // Set up audio element
  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audio.playbackRate = speed;
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
    });

    audio.addEventListener("ended", () => {
      setIsPlaying(false);
    });

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update playback rate when speed changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  const findSectionForTime = useCallback(
    (time: number) => {
      if (sections.length === 0) return null;
      const match = sections.find((s) => time >= s.start_time && time < s.end_time);
      if (match) return match;
      if (time >= sections[sections.length - 1].end_time) return sections[sections.length - 1];
      return sections[0];
    },
    [sections]
  );

  const syncActiveSectionWithTime = useCallback(
    (time: number) => {
      const section = findSectionForTime(time);
      if (section && section.id !== activeSection?.id) {
        setActiveSection(section);
      }
      return section;
    },
    [activeSection?.id, findSectionForTime]
  );

  const seekTo = useCallback(
    (time: number) => {
      if (!audioRef.current) return;
      const audio = audioRef.current;
      const maxDuration =
        Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
      const clamped = Math.max(0, Math.min(time, maxDuration || 0));
      audio.currentTime = clamped;
      setCurrentTime(clamped);
      syncActiveSectionWithTime(clamped);
    },
    [duration, syncActiveSectionWithTime]
  );

  const seekBy = useCallback(
    (seconds: number) => {
      if (!audioRef.current) return;
      seekTo(audioRef.current.currentTime + seconds);
    },
    [seekTo]
  );

  const rewind = useCallback(() => {
    seekBy(-SEEK_STEP_SECONDS);
  }, [seekBy]);

  const forward = useCallback(() => {
    seekBy(SEEK_STEP_SECONDS);
  }, [seekBy]);

  // Metronome engine
  useEffect(() => {
    if (!metronomeOn || !song?.bpm) {
      // Stop any running metronome.
      if (metronomeRef.current) {
        if (metronomeRef.current.timerId !== null) {
          clearTimeout(metronomeRef.current.timerId);
        }
        metronomeRef.current.ctx.close();
        metronomeRef.current = null;
      }
      return;
    }

    const ctx = new AudioContext();
    // Beat interval adjusted for current playback speed.
    const beatInterval = 60 / (song.bpm * speed);
    metronomeRef.current = { ctx, nextBeatTime: ctx.currentTime + 0.1, beatInterval, timerId: null };

    function scheduleClick(time: number, accent: boolean) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = accent ? 1200 : 900;
      gain.gain.setValueAtTime(accent ? 0.5 : 0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      osc.start(time);
      osc.stop(time + 0.05);
    }

    let beatCount = 0;
    const LOOKAHEAD_MS = 100;
    const SCHEDULE_AHEAD = 0.2; // seconds

    function tick() {
      const m = metronomeRef.current;
      if (!m) return;
      while (m.nextBeatTime < m.ctx.currentTime + SCHEDULE_AHEAD) {
        scheduleClick(m.nextBeatTime, beatCount % 4 === 0);
        beatCount++;
        m.nextBeatTime += m.beatInterval;
      }
      m.timerId = setTimeout(tick, LOOKAHEAD_MS);
    }

    tick();

    return () => {
      if (metronomeRef.current) {
        if (metronomeRef.current.timerId !== null) {
          clearTimeout(metronomeRef.current.timerId);
        }
        metronomeRef.current.ctx.close();
        metronomeRef.current = null;
      }
    };
  }, [metronomeOn, song?.bpm, speed]);

  // Animation frame for tracking time
  const updateTime = useCallback(() => {
    if (!audioRef.current) return;

    const audio = audioRef.current;
    const now = audio.currentTime;
    setCurrentTime(now);
    const section = syncActiveSectionWithTime(now);

    // Loop within active section
    if (section && isLooping) {
      if (now >= section.end_time) {
        audio.currentTime = section.start_time;
        setCurrentTime(section.start_time);
      }
    }

    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateTime);
    }
  }, [isPlaying, isLooping, syncActiveSectionWithTime]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateTime);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, updateTime]);

  // Play/Pause
  function togglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      setMetronomeOn(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }

  // Select section
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

  // Cycle speed
  function cycleSpeed() {
    const currentIdx = SPEEDS.findIndex((s) => s.value === speed);
    const nextIdx = (currentIdx + 1) % SPEEDS.length;
    setSpeed(SPEEDS[nextIdx].value);
  }

  function getDefaultFileName(stem: DownloadStemKey): string {
    const baseTitle = (song?.title || "song")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "song";
    return `${baseTitle}-${stem}.wav`;
  }

  function getFileNameFromContentDisposition(disposition: string | null): string | null {
    if (!disposition) return null;
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]);
      } catch {
        // Ignore malformed encoding and continue with fallback parsing.
      }
    }
    const quotedMatch = disposition.match(/filename="([^"]+)"/i);
    if (quotedMatch?.[1]) return quotedMatch[1];
    const unquotedMatch = disposition.match(/filename=([^;]+)/i);
    if (unquotedMatch?.[1]) return unquotedMatch[1].trim();
    return null;
  }

  async function downloadStem(stem: DownloadStemKey): Promise<boolean> {
    if (downloadLockRef.current) return false;
    downloadLockRef.current = true;
    setDownloadError("");
    setDownloadingStem(stem);

    try {
      const res = await fetch(`/api/songs/${songId}/download?stem=${stem}`);
      if (!res.ok) {
        let errorMessage = "Failed to download file";
        try {
          const data = await res.json();
          if (typeof data?.error === "string") {
            errorMessage = data.error;
          }
        } catch {
          // Keep default error message.
        }
        setDownloadError(errorMessage);
        return false;
      }

      const blob = await res.blob();
      const fileName =
        getFileNameFromContentDisposition(res.headers.get("content-disposition")) ||
        getDefaultFileName(stem);

      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);
      return true;
    } catch {
      setDownloadError("Failed to download file");
      return false;
    } finally {
      setDownloadingStem(null);
      downloadLockRef.current = false;
    }
  }

  function DownloadIcon({ color = "currentColor" }: { color?: string }) {
    return (
      <svg
        aria-hidden="true"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M4 20h16" />
      </svg>
    );
  }

  const currentDownloadStem: DownloadStemKey =
    stemMode === "full" ? "full" : stemMode;
  const downloadableStems: Array<{
    key: DownloadStemKey;
    label: string;
    available: boolean;
  }> = [
    { key: "full", label: "Full Mix", available: Boolean(stems?.original_url) },
    { key: "guitar", label: "Guitar", available: Boolean(stems?.guitar_url) },
    { key: "vocals", label: "Vocals", available: Boolean(stems?.vocals_url) },
    { key: "drums", label: "Drums", available: Boolean(stems?.drums_url) },
    { key: "bass", label: "Bass", available: Boolean(stems?.bass_url) },
  ];

  const seekFromClientX = useCallback(
    (clientX: number) => {
      if (!activeSection) return;
      if (!sectionProgressRef.current) return;
      const rect = sectionProgressRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const nextTime =
        activeSection.start_time +
        ratio * (activeSection.end_time - activeSection.start_time);
      seekTo(nextTime);
    },
    [activeSection, seekTo]
  );

  const handleSectionProgressPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      isScrubbingRef.current = true;
      seekFromClientX(e.clientX);
    },
    [seekFromClientX]
  );

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      if (!isScrubbingRef.current) return;
      seekFromClientX(event.clientX);
    }

    function onPointerUp() {
      isScrubbingRef.current = false;
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [seekFromClientX]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        rewind();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        forward();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [forward, rewind]);

  // Calculate section progress
  const sectionProgress =
    activeSection && activeSection.end_time > activeSection.start_time
      ? Math.max(
          0,
          Math.min(
            1,
            (currentTime - activeSection.start_time) /
              (activeSection.end_time - activeSection.start_time)
          )
        )
      : 0;

  // Generate waveform bars (static — no deps, computed once)
  const waveformBars = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => {
        const wave = Math.sin(i * 0.18) * 0.3 + Math.sin(i * 0.07) * 0.2;
        return Math.min(1, 0.12 + Math.abs(wave) + (Math.sin(i * 3.7) * 0.5 + 0.5) * 0.38);
      }),
    []
  );

  // Parse LRC lyrics (only re-parse when lyrics data changes)
  const lrcLines = useMemo(
    () => (lyrics?.synced_lrc ? parseLrc(lyrics.synced_lrc) : []),
    [lyrics?.synced_lrc]
  );

  // Apply offset to LRC timestamps so both highlighting and chord mapping stay in sync
  const adjustedLrcLines = useMemo(
    () => lrcLines.map((line) => ({ ...line, time: line.time + lyricsOffset })),
    [lrcLines, lyricsOffset]
  );

  // Find current lyric line index
  const currentLyricIndex = useMemo(
    () => findCurrentLineIndex(adjustedLrcLines, currentTime),
    [adjustedLrcLines, currentTime]
  );

  // Map each lyric line index → chord labels that start during that line
  const chordsForLine = useMemo(() => {
    if (adjustedLrcLines.length === 0 || chords.length === 0) return new Map<number, string[]>();
    const map = new Map<number, string[]>();
    for (let i = 0; i < adjustedLrcLines.length; i++) {
      const lineStart = adjustedLrcLines[i].time;
      const lineEnd = i + 1 < adjustedLrcLines.length ? adjustedLrcLines[i + 1].time : Infinity;
      const lineChords: string[] = [];
      let prev = "";
      for (const c of chords) {
        if (c.start_time >= lineEnd) break;
        if (c.start_time >= lineStart && c.chord_label !== prev) {
          lineChords.push(c.chord_label);
          prev = c.chord_label;
        }
      }
      if (lineChords.length > 0) map.set(i, lineChords);
    }
    return map;
  }, [adjustedLrcLines, chords]);

  const hasChords = chords.length > 0;
  const hasLyrics = lyrics !== null;

  // Scroll lyrics to current line only when the index changes
  useEffect(() => {
    if (currentLyricIndex < 0 || !lyricsContainerRef.current) return;
    const container = lyricsContainerRef.current;
    const el = container.querySelector(`[data-lyric-index="${currentLyricIndex}"]`) as HTMLElement | null;
    if (el) {
      const top = el.offsetTop - container.offsetTop - 50;
      container.scrollTop = Math.max(0, top);
    }
  }, [currentLyricIndex]);

  if (loading) {
    return (
      <div
        style={{
          maxWidth: 420,
          margin: "0 auto",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Header />
        <TabNav />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg
            className="spinning"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="2"
          >
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
        </div>
        <Footer />
      </div>
    );
  }

  if (!song) {
    return (
      <div
        style={{
          maxWidth: 420,
          margin: "0 auto",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Header />
        <TabNav />
        <div style={{ flex: 1, padding: 24 }}>
          <p
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 12,
              fontWeight: 100,
              color: "var(--color-text-muted)",
            }}
          >
            Song not found.
          </p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 1,
      }}
    >
      <Header songTitle={song.title} songArtist={song.artist || undefined} />
      <TabNav />

      <main style={{ flex: 1, overflow: "hidden" }}>
        {/* Stem toggle pills */}
        <div style={{ padding: "16px 20px 0", display: "flex", gap: 8 }}>
          {(["guitar", "vocals", "full"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setStemMode(mode)}
              style={{
                fontFamily: "var(--font-josefin), sans-serif",
                fontSize: 9,
                fontWeight: 300,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                padding: "7px 14px",
                background:
                  stemMode === mode ? "rgba(212,168,68,0.06)" : "transparent",
                border: `1px solid ${stemMode === mode ? "var(--color-gold)" : "var(--color-border)"}`,
                color:
                  stemMode === mode ? "var(--color-gold)" : "var(--color-text-dark)",
                cursor: "pointer",
                borderRadius: 1,
                transition: "all 0.25s",
              }}
            >
              {mode === "guitar" ? "Guitar Stem" : mode === "vocals" ? "Vocal Stem" : "Full Mix"}
            </button>
          ))}
        </div>

        {/* Download controls */}
        <div style={{ padding: "8px 20px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {downloadableStems.map((item) => (
            <button
              key={item.key}
              onClick={() => downloadStem(item.key)}
              disabled={!item.available || downloadingStem !== null}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                minWidth: 92,
                fontFamily: "var(--font-josefin), sans-serif",
                fontSize: 9,
                fontWeight: 300,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "6px 10px",
                background: "transparent",
                border:
                  item.key === currentDownloadStem
                    ? "1px solid var(--color-gold)"
                    : "1px solid var(--color-border-dark)",
                color: item.available ? "var(--color-text-dark)" : "var(--color-text-darkest)",
                cursor: !item.available || downloadingStem !== null ? "default" : "pointer",
                opacity: !item.available || downloadingStem !== null ? 0.45 : 1,
                borderRadius: 1,
              }}
            >
              <span>{item.label}</span>
              <DownloadIcon color={item.available ? "currentColor" : "var(--color-text-darkest)"} />
            </button>
          ))}
        </div>
        {downloadError && (
          <p
            style={{
              padding: "8px 20px 0",
              margin: 0,
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 10,
              letterSpacing: "0.08em",
              color: "var(--color-terracotta)",
            }}
          >
            {downloadError}
          </p>
        )}

        {/* Waveform visualization */}
        <div style={{ padding: "16px 20px 8px" }}>
          <div
            style={{
              height: 60,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            {waveformBars.map((h, i) => {
              const barProgress = i / waveformBars.length;
              const overallProgress = duration > 0 ? currentTime / duration : 0;

              // Determine which section this bar belongs to
              const barTime = barProgress * duration;
              const barSection = sections.find(
                (s) => barTime >= s.start_time && barTime < s.end_time
              );

              let color = "var(--color-inactive)";
              if (barSection) {
                color = barProgress <= overallProgress
                  ? getSectionColor(barSection.label)
                  : `${getSectionColor(barSection.label)}33`;
              }

              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${h * 100}%`,
                    background: color,
                    borderRadius: 0.5,
                    transition: "background 0.15s",
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Active section progress */}
        {activeSection && (
          <div
            style={{
              padding: "4px 20px 10px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-josefin), sans-serif",
                fontSize: 10,
                fontWeight: 300,
                letterSpacing: "0.06em",
                color: "var(--color-text-dark)",
                minWidth: 32,
              }}
            >
              {formatTime(currentTime)}
            </span>

            {/* Progress bar */}
            <div
              ref={sectionProgressRef}
              onPointerDown={handleSectionProgressPointerDown}
              style={{ flex: 1, position: "relative", height: 4, cursor: "ew-resize" }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "var(--color-border-dark)",
                  borderRadius: 2,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: `${sectionProgress * 100}%`,
                  background: getSectionColor(activeSection.label),
                  borderRadius: 2,
                  transition: "width 0.1s linear",
                }}
              />
              {/* Diamond indicator */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: `${sectionProgress * 100}%`,
                  transform: "translate(-50%, -50%) rotate(45deg)",
                  width: 5,
                  height: 5,
                  background: "var(--color-gold)",
                }}
              />
            </div>

            <span
              style={{
                fontFamily: "var(--font-josefin), sans-serif",
                fontSize: 10,
                fontWeight: 300,
                letterSpacing: "0.06em",
                color: "var(--color-text-dark)",
                minWidth: 32,
                textAlign: "right",
              }}
            >
              {formatTime(activeSection.end_time)}
            </span>
          </div>
        )}

        {/* Active section label */}
        {activeSection && (
          <div
            style={{
              padding: "0 20px 6px",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-playfair), Georgia, serif",
                fontSize: 13,
                fontStyle: "italic",
                color: "var(--color-text-secondary)",
              }}
            >
              {activeSection.label}
            </span>
            <span
              style={{
                fontFamily: "var(--font-josefin), sans-serif",
                fontSize: 10,
                fontWeight: 100,
                letterSpacing: "0.1em",
                color: "var(--color-text-dark)",
              }}
            >
              {formatTime(activeSection.start_time)} &mdash;{" "}
              {formatTime(activeSection.end_time)}
            </span>
          </div>
        )}

        {/* Transport controls */}
        <div
          style={{
            padding: "6px 20px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
          }}
        >
          {/* Loop toggle */}
          <button
            onClick={() => setIsLooping(!isLooping)}
            style={{
              background: "none",
              border: "none",
              padding: 10,
              cursor: "pointer",
              color: isLooping ? "var(--color-gold)" : "var(--color-text-muted)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 1l4 4-4 4" />
              <path d="M3 11V9a4 4 0 014-4h14" />
              <path d="M7 23l-4-4 4-4" />
              <path d="M21 13v2a4 4 0 01-4 4H3" />
            </svg>
          </button>

          {/* Metronome toggle */}
          {song?.bpm && (
            <button
              onClick={() => setMetronomeOn((v) => !v)}
              title={metronomeOn ? `Metronome on — ${song.bpm} BPM` : `Metronome off — ${song.bpm} BPM`}
              style={{
                background: "none",
                border: "none",
                padding: 10,
                cursor: "pointer",
                color: metronomeOn ? "var(--color-gold)" : "var(--color-text-muted)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
              }}
            >
              {/* Metronome icon — pendulum shape */}
              <svg width="16" height="18" viewBox="0 0 16 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <polygon points="8,1 15,17 1,17" strokeLinejoin="round" />
                <line x1="8" y1="17" x2="8" y2="6" />
                <circle cx={metronomeOn ? "10.5" : "5.5"} cy="10" r="1.2" fill="currentColor" stroke="none">
                  {metronomeOn && (
                    <animate attributeName="cx" values="5.5;10.5;5.5" dur={`${(60 / (song.bpm * speed)) * 2}s`} repeatCount="indefinite" />
                  )}
                </circle>
              </svg>
              <span style={{ fontFamily: "var(--font-josefin), sans-serif", fontSize: 8, letterSpacing: "0.04em" }}>
                {Math.round(song.bpm)}
              </span>
            </button>
          )}

          {/* Rewind */}
          <button
            onClick={rewind}
            title={`Rewind ${SEEK_STEP_SECONDS}s`}
            aria-label={`Rewind ${SEEK_STEP_SECONDS} seconds`}
            style={{
              background: "none",
              border: "none",
              padding: 10,
              cursor: "pointer",
              color: "var(--color-text-muted)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
            </svg>
          </button>

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            style={{
              width: 58,
              height: 58,
              borderRadius: "50%",
              border: "1.5px solid var(--color-gold)",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              color: "var(--color-gold)",
            }}
          >
            {/* Inner circle */}
            <div
              style={{
                position: "absolute",
                inset: 4,
                borderRadius: "50%",
                background: "rgba(212,168,68,0.08)",
              }}
            />
            {isPlaying ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ position: "relative", zIndex: 1 }}>
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg
                width="18"
                height="20"
                viewBox="0 0 18 20"
                fill="currentColor"
                style={{ position: "relative", zIndex: 1, marginLeft: 2 }}
              >
                <path d="M0 0L18 10L0 20V0Z" />
              </svg>
            )}
          </button>

          {/* Forward */}
          <button
            onClick={forward}
            title={`Forward ${SEEK_STEP_SECONDS}s`}
            aria-label={`Forward ${SEEK_STEP_SECONDS} seconds`}
            style={{
              background: "none",
              border: "none",
              padding: 10,
              cursor: "pointer",
              color: "var(--color-text-muted)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 6h2v12h-2V6zm-1.5 6L6 6v12l8.5-6z" />
            </svg>
          </button>

          {/* Speed */}
          <button
            onClick={cycleSpeed}
            style={{
              background: "none",
              border: "none",
              padding: 10,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-josefin), sans-serif",
                fontSize: 12,
                fontWeight: 300,
                letterSpacing: "0.05em",
                color: "var(--color-text-dark)",
              }}
            >
              {speed === 1 ? "1x" : `${speed}x`}
            </span>
          </button>
        </div>

        {/* Speed presets */}
        <div style={{ padding: "0 20px 14px", display: "flex", gap: 6 }}>
          {SPEEDS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSpeed(s.value)}
              style={{
                fontFamily: "var(--font-josefin), sans-serif",
                fontSize: 9,
                fontWeight: 300,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "6px 12px",
                background: "transparent",
                border: `1px solid ${speed === s.value ? "var(--color-gold)" : "var(--color-border-dark)"}`,
                color: speed === s.value ? "var(--color-gold)" : "var(--color-text-dark)",
                cursor: "pointer",
                borderRadius: 1,
                transition: "all 0.25s",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Chords & Lyrics toggle + combined panel */}
        {(hasChords || hasLyrics) && (
          <div style={{ padding: "0 20px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: showPanel ? 12 : 0 }}>
              <button
                onClick={() => setShowPanel(!showPanel)}
                style={{
                  fontFamily: "var(--font-josefin), sans-serif",
                  fontSize: 9,
                  fontWeight: 300,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  padding: "7px 14px",
                  background: showPanel ? "rgba(212,168,68,0.06)" : "transparent",
                  border: `1px solid ${showPanel ? "var(--color-gold)" : "var(--color-border)"}`,
                  color: showPanel ? "var(--color-gold)" : "var(--color-text-dark)",
                  cursor: "pointer",
                  borderRadius: 1,
                  transition: "all 0.25s",
                }}
              >
                Chords &amp; Lyrics
              </button>

              {/* Sync offset controls */}
              {showPanel && lrcLines.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button
                    onClick={() => setLyricsOffset((o) => Math.round((o - 0.5) * 10) / 10)}
                    style={{
                      width: 24, height: 24,
                      background: "transparent",
                      border: "1px solid var(--color-border-dark)",
                      color: "var(--color-text-dark)",
                      cursor: "pointer",
                      fontFamily: "var(--font-josefin), sans-serif",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 1,
                    }}
                  >
                    &minus;
                  </button>
                  <span
                    style={{
                      fontFamily: "var(--font-josefin), sans-serif",
                      fontSize: 9,
                      fontWeight: 300,
                      letterSpacing: "0.06em",
                      color: lyricsOffset === 0 ? "var(--color-text-muted)" : "var(--color-gold)",
                      minWidth: 44,
                      textAlign: "center",
                      cursor: "pointer",
                    }}
                    onClick={() => setLyricsOffset(0)}
                    title="Click to reset"
                  >
                    {lyricsOffset === 0 ? "sync" : `${lyricsOffset > 0 ? "+" : ""}${lyricsOffset.toFixed(1)}s`}
                  </span>
                  <button
                    onClick={() => setLyricsOffset((o) => Math.round((o + 0.5) * 10) / 10)}
                    style={{
                      width: 24, height: 24,
                      background: "transparent",
                      border: "1px solid var(--color-border-dark)",
                      color: "var(--color-text-dark)",
                      cursor: "pointer",
                      fontFamily: "var(--font-josefin), sans-serif",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 1,
                    }}
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            {showPanel && (
              <div
                ref={lyricsContainerRef}
                style={{
                  maxHeight: 220,
                  overflowY: "auto",
                  padding: "12px 16px",
                  border: "1px solid var(--color-border-dark)",
                  borderRadius: 2,
                  scrollBehavior: "smooth",
                }}
              >
                {lrcLines.length > 0 ? (
                  lrcLines.map((line, i) => {
                    const isCurrent = i === currentLyricIndex;
                    const lineChords = chordsForLine.get(i);
                    return (
                      <div key={i} data-lyric-index={i}>
                        {lineChords && (
                          <p
                            style={{
                              fontFamily: "var(--font-josefin), sans-serif",
                              fontSize: 10,
                              fontWeight: 400,
                              letterSpacing: "0.08em",
                              color: isCurrent ? "var(--color-gold)" : "var(--color-orange)",
                              padding: "4px 0 0",
                              lineHeight: 1.3,
                              transition: "color 0.2s",
                            }}
                          >
                            {lineChords.join("  ")}
                          </p>
                        )}
                        <p
                          style={{
                            fontFamily: "var(--font-josefin), sans-serif",
                            fontSize: isCurrent ? 13 : 11,
                            fontWeight: isCurrent ? 400 : 100,
                            color: isCurrent
                              ? "var(--color-gold)"
                              : "var(--color-text-muted)",
                            padding: "1px 0 3px",
                            transition: "all 0.2s",
                            lineHeight: 1.5,
                          }}
                        >
                          {line.text}
                        </p>
                      </div>
                    );
                  })
                ) : lyrics?.plain_text ? (
                  <p
                    style={{
                      fontFamily: "var(--font-josefin), sans-serif",
                      fontSize: 11,
                      fontWeight: 100,
                      color: "var(--color-text-secondary)",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.7,
                    }}
                  >
                    {lyrics.plain_text}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* Sections list */}
        <div style={{ padding: "0 20px 24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-josefin), sans-serif",
                fontSize: 9,
                fontWeight: 100,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
              }}
            >
              Sections
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {sections.map((section) => {
              const isActive = activeSection?.id === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => handleSelectSection(section)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "13px 16px",
                    background: "transparent",
                    border: `1px solid ${isActive ? getSectionColor(section.label) : "var(--color-border-dark)"}`,
                    borderLeft: isActive
                      ? `3px solid ${getSectionColor(section.label)}`
                      : `1px solid ${isActive ? getSectionColor(section.label) : "var(--color-border-dark)"}`,
                    borderRadius: 2,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    transition: "all 0.2s",
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontFamily: "var(--font-playfair), Georgia, serif",
                        fontSize: 13,
                        fontStyle: "italic",
                        color: isActive
                          ? getSectionColor(section.label)
                          : "var(--color-text-darker)",
                      }}
                    >
                      {section.label}
                    </p>
                    <p
                      style={{
                        fontFamily: "var(--font-josefin), sans-serif",
                        fontSize: 10,
                        fontWeight: 100,
                        letterSpacing: "0.06em",
                        color: "var(--color-text-dark)",
                        marginTop: 2,
                      }}
                    >
                      {formatTime(section.start_time)} &mdash;{" "}
                      {formatTime(section.end_time)}
                    </p>
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-josefin), sans-serif",
                      fontSize: 9,
                      color: "var(--color-text-darkest)",
                    }}
                  >
                    {formatTime(section.end_time - section.start_time)}
                  </span>
                </button>
              );
            })}

            {sections.length === 0 && (
              <p
                style={{
                  fontFamily: "var(--font-josefin), sans-serif",
                  fontSize: 11,
                  fontWeight: 100,
                  color: "var(--color-text-muted)",
                  padding: "16px 0",
                  textAlign: "center",
                }}
              >
                No sections detected yet
              </p>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
