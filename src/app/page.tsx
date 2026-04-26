"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import TabNav from "@/components/TabNav";
import Footer from "@/components/Footer";

const STAGES = [
  { title: "Lighting the fire...", subtitle: "Validating & queuing your song", start: 0 },
  { title: "Riding the highway...", subtitle: "Downloading audio from YouTube", start: 5 },
  { title: "Breaking on through...", subtitle: "Separating guitar from the mix", start: 20 },
  { title: "Mapping the strange days...", subtitle: "Detecting song sections", start: 90 },
  { title: "Decoding the crystal ship...", subtitle: "Analyzing chord progressions", start: 130 },
  { title: "Whispering the words...", subtitle: "Fetching synced lyrics", start: 170 },
  { title: "The doors are open.", subtitle: "Ready to play", start: Infinity },
];

const DOORS_QUOTES = [
  "The time to hesitate is through...",
  "There's danger on the edge of town...",
  "Can you give me sanctuary?",
  "Let it roll, baby, roll...",
  "Keep your eyes on the road, your hands upon the wheel...",
  "The future's uncertain and the end is always near...",
  "I found an island in your arms, a country in your eyes...",
  "People are strange when you're a stranger...",
  "No one here gets out alive...",
  "We could plan a murder, or start a religion...",
  "I am the Lizard King. I can do anything...",
  "This is the end, beautiful friend...",
];

const STEPS = [
  { num: "I", text: "Paste a YouTube link to any song" },
  { num: "II", text: "We separate the guitar stem using AI" },
  { num: "III", text: "Sections are detected automatically" },
  { num: "IV", text: "Loop any section at any speed and practice" },
];

export default function ImportPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importingSongIdRef = useRef<string | null>(null);

  // Timer: tick every second while importing
  useEffect(() => {
    if (!importing) return;
    const timer = setInterval(() => setElapsedTime((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [importing]);

  // Quote rotation: cycle every 4s while importing
  useEffect(() => {
    if (!importing) return;
    const rotator = setInterval(
      () => setQuoteIndex((i) => (i + 1) % DOORS_QUOTES.length),
      4000,
    );
    return () => clearInterval(rotator);
  }, [importing]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Derive current stage index from elapsed time (cap at stage 5, index 0-5; stage 6 only on ready)
  const currentStage = useMemo(() => {
    if (finished) return 6;
    for (let i = STAGES.length - 1; i >= 0; i--) {
      if (elapsedTime >= STAGES[i].start) return i;
    }
    return 0;
  }, [elapsedTime, finished]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    const isYouTube = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/)/.test(trimmed);
    if (!isYouTube) {
      setError("Please paste a YouTube link (youtube.com/watch or youtu.be/...)");
      return;
    }

    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setImporting(true);
    setError("");
    setNotice("");
    setFinished(false);
    setElapsedTime(0);
    setQuoteIndex(0);

    try {
      const res = await fetch("/api/songs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtube_url: url }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to import song");
        setImporting(false);
        return;
      }

      // Poll for status
      const songId = data.id;
      importingSongIdRef.current = songId;
      const poll = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/songs/${songId}/status`);
          const statusData = await statusRes.json();

          if (statusData.status === "ready") {
            clearInterval(poll);
            pollRef.current = null;
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            importingSongIdRef.current = null;
            setFinished(true);
            setNotice("Song ready. Opening player...");
            setTimeout(() => router.push(`/song/${songId}`), 1500);
          } else if (statusData.status === "failed") {
            clearInterval(poll);
            pollRef.current = null;
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            importingSongIdRef.current = null;
            setError(statusData.last_error || "The music's over... Processing failed. Please try again.");
            setImporting(false);
          }
        } catch {
          // Continue polling
        }
      }, 3000);
      pollRef.current = poll;

      // Stop polling after 5 minutes
      timeoutRef.current = setTimeout(() => {
        clearInterval(poll);
        if (pollRef.current === poll) {
          pollRef.current = null;
          importingSongIdRef.current = null;
          setImporting(false);
          setNotice("Still processing in the background. Check Library in a minute.");
        }
        timeoutRef.current = null;
      }, 300000);
    } catch {
      setError("Could not connect to the server. Is the Mac server running?");
      setImporting(false);
    }
  }

  function handleCancelImport() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const songId = importingSongIdRef.current;
    importingSongIdRef.current = null;
    setImporting(false);
    setFinished(false);
    setNotice("Import canceled.");

    if (songId) {
      fetch(`/api/songs/${songId}`, { method: "DELETE" }).catch(() => {
        // Best-effort cleanup; ignore failures.
      });
    }
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
      <Header />
      <TabNav />

      <main style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", gap: 30 }}>
        {/* Hero text */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-playfair), Georgia, serif",
              fontSize: 32,
              fontWeight: 700,
              fontStyle: "italic",
              lineHeight: 1.25,
              color: "var(--color-text)",
            }}
          >
            Break on through
            <br />
            to the other side.
          </p>
          <p
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 13,
              fontWeight: 300,
              letterSpacing: "0.1em",
              lineHeight: 1.8,
              color: "var(--color-text-muted)",
              marginTop: 14,
            }}
          >
            Paste a YouTube link. We&apos;ll isolate the guitar,
            <br />
            detect the sections, and let you practice at any speed.
          </p>
        </div>

        {/* URL Input Form */}
        <form onSubmit={handleImport} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            disabled={importing}
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 13,
              fontWeight: 400,
              letterSpacing: "0.06em",
              padding: "14px 16px",
              background: "var(--color-input-bg)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              outline: "none",
              width: "100%",
            }}
          />
          <button
            type="submit"
            disabled={importing || !url.trim()}
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              padding: "14px 24px",
              background: "transparent",
              border: "1px solid var(--color-gold)",
              color: "var(--color-gold)",
              cursor: importing || !url.trim() ? "default" : "pointer",
              opacity: importing || !url.trim() ? 0.5 : 1,
              transition: "background 0.25s, opacity 0.25s",
              width: "100%",
            }}
          >
            {importing ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <svg
                  className="spinning"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                Processing...
              </span>
            ) : (
              "Import Song"
            )}
          </button>
        </form>

        {/* Error */}
        {error && (
          <p
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 12,
              fontWeight: 400,
              color: "var(--color-terracotta)",
              letterSpacing: "0.06em",
            }}
          >
            {error}
          </p>
        )}

        {notice && (
          <p
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 12,
              fontWeight: 300,
              color: "var(--color-text-muted)",
              letterSpacing: "0.06em",
            }}
          >
            {notice}
          </p>
        )}

        {/* Doors-themed processing panel */}
        {importing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center", textAlign: "center" }}>
            {/* Dot progress indicator */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {STAGES.map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: i <= currentStage ? "var(--color-gold)" : "var(--color-border)",
                    opacity: i <= currentStage ? 1 : 0.35,
                    transition: "background 0.5s, opacity 0.5s",
                  }}
                />
              ))}
              <span
                style={{
                  fontFamily: "var(--font-josefin), sans-serif",
                  fontSize: 11,
                  fontWeight: 400,
                  letterSpacing: "0.1em",
                  color: "var(--color-text-muted)",
                  marginLeft: 8,
                }}
              >
                Stage {currentStage + 1} of {STAGES.length}
              </span>
            </div>

            {/* Stage title */}
            <p
              style={{
                fontFamily: "var(--font-playfair), Georgia, serif",
                fontSize: 24,
                fontStyle: "italic",
                fontWeight: 700,
                color: "var(--color-gold)",
                lineHeight: 1.3,
                transition: "opacity 0.4s",
              }}
            >
              {STAGES[currentStage].title}
            </p>

            {/* Stage subtitle */}
            <p
              style={{
                fontFamily: "var(--font-josefin), sans-serif",
                fontSize: 12,
                fontWeight: 400,
                letterSpacing: "0.06em",
                color: "var(--color-text-muted)",
                marginTop: -12,
              }}
            >
              {STAGES[currentStage].subtitle}
            </p>

            {/* Elapsed timer */}
            <p
              style={{
                fontFamily: "var(--font-josefin), sans-serif",
                fontSize: 14,
                fontWeight: 400,
                letterSpacing: "0.15em",
                color: "var(--color-text-darker)",
              }}
            >
              ⏱ {formatTime(elapsedTime)}
            </p>

            {/* Rotating Doors quote */}
            {!finished && (
              <p
                key={quoteIndex}
                className="fade-up"
                style={{
                  fontFamily: "var(--font-playfair), Georgia, serif",
                  fontSize: 14,
                  fontStyle: "italic",
                  color: "var(--color-text-muted)",
                  opacity: 0.75,
                  minHeight: 20,
                }}
              >
                &ldquo;{DOORS_QUOTES[quoteIndex]}&rdquo;
              </p>
            )}

            {/* Cancel link */}
            {!finished && (
              <button
                type="button"
                onClick={handleCancelImport}
                style={{
                  fontFamily: "var(--font-josefin), sans-serif",
                  fontSize: 10,
                  fontWeight: 300,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 8px",
                  textDecoration: "underline",
                  textUnderlineOffset: 4,
                }}
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {/* How it works */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            How it works
          </p>
          <div
            style={{
              height: 1,
              background: "var(--color-border-dark)",
            }}
          />
          {STEPS.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <span
                style={{
                  fontFamily: "var(--font-playfair), Georgia, serif",
                  fontSize: 14,
                  fontStyle: "italic",
                  color: "var(--color-gold)",
                  opacity: 0.9,
                  minWidth: 20,
                }}
              >
                {step.num}
              </span>
              <p
                style={{
                  fontFamily: "var(--font-josefin), sans-serif",
                  fontSize: 13,
                  fontWeight: 400,
                  letterSpacing: "0.04em",
                  lineHeight: 1.5,
                  color: "var(--color-text-dark)",
                }}
              >
                {step.text}
              </p>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
