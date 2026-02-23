"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Header from "@/components/Header";
import TabNav from "@/components/TabNav";
import Footer from "@/components/Footer";
import ChordDiagram from "@/components/ChordDiagram";
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

export default function SongPlayerPage() {
  const params = useParams();
  const songId = params.id as string;

  const [song, setSong] = useState<Song | null>(null);
  const [stems, setStems] = useState<Stem | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [chords, setChords] = useState<Chord[]>([]);
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [loading, setLoading] = useState(true);

  const [stemMode, setStemMode] = useState<"guitar" | "full">("guitar");
  const [panelMode, setPanelMode] = useState<"chords" | "lyrics" | "both">("both");
  const [showPanel, setShowPanel] = useState(false);
  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [speed, setSpeed] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);

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
  const audioUrl = stemMode === "guitar" ? stems?.guitar_url : stems?.original_url;

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

  // Animation frame for tracking time
  const updateTime = useCallback(() => {
    if (!audioRef.current) return;

    const audio = audioRef.current;
    setCurrentTime(audio.currentTime);

    // Loop within active section
    if (activeSection && isLooping) {
      if (audio.currentTime >= activeSection.end_time) {
        audio.currentTime = activeSection.start_time;
      }
    }

    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateTime);
    }
  }, [isPlaying, activeSection, isLooping]);

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

  // Prev/Next section
  function prevSection() {
    if (!activeSection || sections.length === 0) return;
    const idx = sections.findIndex((s) => s.id === activeSection.id);
    const prev = sections[Math.max(0, idx - 1)];
    handleSelectSection(prev);
  }

  function nextSection() {
    if (!activeSection || sections.length === 0) return;
    const idx = sections.findIndex((s) => s.id === activeSection.id);
    const next = sections[Math.min(sections.length - 1, idx + 1)];
    handleSelectSection(next);
  }

  // Cycle speed
  function cycleSpeed() {
    const currentIdx = SPEEDS.findIndex((s) => s.value === speed);
    const nextIdx = (currentIdx + 1) % SPEEDS.length;
    setSpeed(SPEEDS[nextIdx].value);
  }

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

  // Derive current chord from playback time
  const currentChord = useMemo(
    () =>
      chords.find(
        (c) => currentTime >= c.start_time && currentTime < c.end_time
      ) || null,
    [chords, currentTime]
  );

  // Find the next upcoming chord
  const nextChord = useMemo(
    () =>
      currentChord
        ? chords.find((c) => c.start_time > currentChord.end_time - 0.1) || null
        : chords.find((c) => c.start_time > currentTime) || null,
    [chords, currentChord, currentTime]
  );

  // Parse LRC lyrics (only re-parse when lyrics data changes)
  const lrcLines = useMemo(
    () => (lyrics?.synced_lrc ? parseLrc(lyrics.synced_lrc) : []),
    [lyrics?.synced_lrc]
  );

  // Find current lyric line index
  const currentLyricIndex = useMemo(
    () => findCurrentLineIndex(lrcLines, currentTime),
    [lrcLines, currentTime]
  );

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
          {(["guitar", "full"] as const).map((mode) => (
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
              {mode === "guitar" ? "Guitar Stem" : "Full Mix"}
            </button>
          ))}
        </div>

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
            <div style={{ flex: 1, position: "relative", height: 4 }}>
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

          {/* Previous */}
          <button
            onClick={prevSection}
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

          {/* Next */}
          <button
            onClick={nextSection}
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

        {/* Chords & Lyrics panel */}
        {(hasChords || hasLyrics) && (
          <div style={{ padding: "0 20px 14px" }}>
            {/* Toggle pills — clicking activates panel + selects mode; clicking active pill hides panel */}
            <div style={{ display: "flex", gap: 8, marginBottom: showPanel ? 12 : 0 }}>
              {(["chords", "lyrics", "both"] as const).map((mode) => {
                const enabled =
                  mode === "chords" ? hasChords :
                  mode === "lyrics" ? hasLyrics :
                  hasChords || hasLyrics;
                if (!enabled) return null;
                const isActive = showPanel && panelMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => {
                      if (isActive) {
                        setShowPanel(false);
                      } else {
                        setPanelMode(mode);
                        setShowPanel(true);
                      }
                    }}
                    style={{
                      fontFamily: "var(--font-josefin), sans-serif",
                      fontSize: 9,
                      fontWeight: 300,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      padding: "7px 14px",
                      background:
                        isActive ? "rgba(212,168,68,0.06)" : "transparent",
                      border: `1px solid ${isActive ? "var(--color-gold)" : "var(--color-border)"}`,
                      color:
                        isActive ? "var(--color-gold)" : "var(--color-text-dark)",
                      cursor: "pointer",
                      borderRadius: 1,
                      transition: "all 0.25s",
                    }}
                  >
                    {mode === "both" ? "Both" : mode === "chords" ? "Chords" : "Lyrics"}
                  </button>
                );
              })}
            </div>

            {/* Chord display */}
            {showPanel && (panelMode === "chords" || panelMode === "both") && hasChords && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "12px 16px",
                  border: "1px solid var(--color-border-dark)",
                  borderRadius: 2,
                  marginBottom: panelMode === "both" && hasLyrics ? 10 : 0,
                }}
              >
                {/* Current chord name + diagram */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 80 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-playfair), Georgia, serif",
                      fontSize: 28,
                      fontStyle: "italic",
                      color: "var(--color-gold)",
                      lineHeight: 1,
                      marginBottom: 6,
                    }}
                  >
                    {currentChord?.chord_label || "—"}
                  </span>
                  {currentChord && (
                    <ChordDiagram chordName={currentChord.chord_label} width={100} />
                  )}
                </div>

                {/* Next chord preview */}
                {nextChord && nextChord.chord_label !== currentChord?.chord_label && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      opacity: 0.4,
                      marginLeft: "auto",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-josefin), sans-serif",
                        fontSize: 8,
                        fontWeight: 100,
                        letterSpacing: "0.15em",
                        textTransform: "uppercase",
                        color: "var(--color-text-muted)",
                        marginBottom: 4,
                      }}
                    >
                      Next
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-playfair), Georgia, serif",
                        fontSize: 18,
                        fontStyle: "italic",
                        color: "var(--color-text-secondary)",
                        lineHeight: 1,
                      }}
                    >
                      {nextChord.chord_label}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Lyrics display */}
            {showPanel && (panelMode === "lyrics" || panelMode === "both") && hasLyrics && (
              <div
                ref={lyricsContainerRef}
                style={{
                  maxHeight: 160,
                  overflowY: "auto",
                  padding: "12px 16px",
                  border: "1px solid var(--color-border-dark)",
                  borderRadius: 2,
                  scrollBehavior: "smooth",
                }}
              >
                {lrcLines.length > 0 ? (
                  /* Synced lyrics */
                  lrcLines.map((line, i) => {
                    const isCurrent = i === currentLyricIndex;
                    return (
                      <p
                        key={i}
                        data-lyric-index={i}
                        style={{
                          fontFamily: "var(--font-josefin), sans-serif",
                          fontSize: isCurrent ? 13 : 11,
                          fontWeight: isCurrent ? 400 : 100,
                          color: isCurrent
                            ? "var(--color-gold)"
                            : "var(--color-text-muted)",
                          padding: "3px 0",
                          transition: "all 0.2s",
                          lineHeight: 1.5,
                        }}
                      >
                        {line.text}
                      </p>
                    );
                  })
                ) : lyrics?.plain_text ? (
                  /* Static plain text */
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
