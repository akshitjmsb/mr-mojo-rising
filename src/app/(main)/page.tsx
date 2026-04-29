"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";

type Song = Database["public"]["Tables"]["songs"]["Row"];

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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importingSongIdRef = useRef<string | null>(null);
  const [importingSongId, setImportingSongId] = useState<string | null>(null);

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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Subscribe to the imported song's row via Realtime — replaces 3s polling.
  useEffect(() => {
    if (!importingSongId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`song-${importingSongId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "songs",
          filter: `id=eq.${importingSongId}`,
        },
        (payload) => {
          const next = payload.new as Song;
          if (next.status === "ready") {
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            importingSongIdRef.current = null;
            setFinished(true);
            setNotice("Song ready. Opening player...");
            setTimeout(() => router.push(`/song/${next.id}`), 1500);
          } else if (next.status === "failed") {
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            importingSongIdRef.current = null;
            setError(
              next.last_error ||
                "The music's over... Processing failed. Please try again.",
            );
            setImporting(false);
            setImportingSongId(null);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [importingSongId, router]);

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
    setImportingSongId(null);

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

      const songId = data.id as string;
      importingSongIdRef.current = songId;
      setImportingSongId(songId);

      // Safety timeout: detach the subscription after 5 minutes if the worker
      // never reports terminal status (e.g. mac-server is down).
      timeoutRef.current = setTimeout(() => {
        if (importingSongIdRef.current === songId) {
          importingSongIdRef.current = null;
          setImporting(false);
          setImportingSongId(null);
          setNotice(
            "Still processing in the background. Check Library in a minute.",
          );
        }
        timeoutRef.current = null;
      }, 300000);
    } catch {
      setError("Could not connect to the server. Is the Mac server running?");
      setImporting(false);
    }
  }

  function handleCancelImport() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const songId = importingSongIdRef.current;
    importingSongIdRef.current = null;
    setImporting(false);
    setImportingSongId(null);
    setFinished(false);
    setNotice("Import canceled.");

    if (songId) {
      fetch(`/api/songs/${songId}`, { method: "DELETE" }).catch(() => {
        // Best-effort cleanup; ignore failures.
      });
    }
  }

  const submitDisabled = importing || !url.trim();

  return (
    <main className="flex flex-1 flex-col gap-[30px] p-6">
      <div>
        <p className="font-playfair text-[32px] font-bold italic leading-[1.25] text-text">
          Break on through
          <br />
          to the other side.
        </p>
        <p className="mt-3.5 font-josefin text-[13px] font-light leading-[1.8] tracking-[0.1em] text-text-muted">
          Paste a YouTube link. We&apos;ll isolate the guitar,
          <br />
          detect the sections, and let you practice at any speed.
        </p>
      </div>

      <form onSubmit={handleImport} className="flex flex-col gap-2.5">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          disabled={importing}
          className="w-full bg-input-bg border border-border px-4 py-3.5 font-josefin text-[13px] tracking-[0.06em] text-text outline-none"
        />
        <button
          type="submit"
          disabled={submitDisabled}
          className="w-full border border-gold bg-transparent px-6 py-3.5 font-josefin text-[11px] uppercase tracking-[0.2em] text-gold transition-opacity duration-300 disabled:cursor-default disabled:opacity-50"
        >
          {importing ? (
            <span className="flex items-center justify-center gap-2">
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

      {error && (
        <p className="font-josefin text-[12px] tracking-[0.06em] text-terracotta">
          {error}
        </p>
      )}

      {notice && (
        <p className="font-josefin text-[12px] font-light tracking-[0.06em] text-text-muted">
          {notice}
        </p>
      )}

      {importing && (
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex items-center gap-2">
            {STAGES.map((_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full transition-all duration-500 ${
                  i <= currentStage
                    ? "bg-gold opacity-100"
                    : "bg-border opacity-35"
                }`}
              />
            ))}
            <span className="ml-2 font-josefin text-[11px] tracking-[0.1em] text-text-muted">
              Stage {currentStage + 1} of {STAGES.length}
            </span>
          </div>

          <p className="font-playfair text-[24px] font-bold italic leading-[1.3] text-gold">
            {STAGES[currentStage].title}
          </p>

          <p className="-mt-3 font-josefin text-[12px] tracking-[0.06em] text-text-muted">
            {STAGES[currentStage].subtitle}
          </p>

          <p className="font-josefin text-[14px] tracking-[0.15em] text-text-darker">
            ⏱ {formatTime(elapsedTime)}
          </p>

          {!finished && (
            <p
              key={quoteIndex}
              className="fade-up min-h-5 font-playfair text-[14px] italic text-text-muted opacity-75"
            >
              &ldquo;{DOORS_QUOTES[quoteIndex]}&rdquo;
            </p>
          )}

          {!finished && (
            <button
              type="button"
              onClick={handleCancelImport}
              className="cursor-pointer border-none bg-transparent px-2 py-1 font-josefin text-[10px] font-light uppercase tracking-[0.18em] text-text-muted underline underline-offset-4"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <p className="font-josefin text-[11px] uppercase tracking-[0.2em] text-text-muted">
          How it works
        </p>
        <div className="h-px bg-border-dark" />
        {STEPS.map((step, i) => (
          <div key={i} className="flex items-start gap-3.5">
            <span className="min-w-5 font-playfair text-[14px] italic text-gold opacity-90">
              {step.num}
            </span>
            <p className="font-josefin text-[13px] leading-[1.5] tracking-[0.04em] text-text-dark">
              {step.text}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
