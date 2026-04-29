"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@/lib/database.types";

type Song = Database["public"]["Tables"]["songs"]["Row"];

export default function LibraryPage() {
  const router = useRouter();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [retryingSongId, setRetryingSongId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchSongs = useCallback(async () => {
    const res = await fetch("/api/songs");
    const data = await res.json();
    setSongs(Array.isArray(data) ? (data as Song[]) : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchSongs();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchSongs]);

  // Auto-refresh while any song is processing/queued
  useEffect(() => {
    const hasInflight = songs.some(
      (s) => s.status === "processing" || s.status === "queued"
    );
    if (!hasInflight) return;
    const interval = setInterval(() => {
      fetchSongs();
    }, 4000);
    return () => clearInterval(interval);
  }, [songs, fetchSongs]);

  // Reset delete confirmation when tapping outside that song row
  useEffect(() => {
    if (!confirmDeleteId) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(`[data-confirm-target="${confirmDeleteId}"]`)) {
        setConfirmDeleteId(null);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [confirmDeleteId]);

  async function handleDeleteSong(song: Song) {
    if (confirmDeleteId !== song.id) {
      setConfirmDeleteId(song.id);
      return;
    }

    setError("");
    setConfirmDeleteId(null);
    setDeletingSongId(song.id);

    try {
      const res = await fetch(`/api/songs/${song.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to delete song");
        return;
      }

      setSongs((prev) => prev.filter((s) => s.id !== song.id));
    } catch {
      setError("Failed to delete song");
    } finally {
      setDeletingSongId(null);
    }
  }

  async function handleRetrySong(song: Song) {
    setError("");
    setRetryingSongId(song.id);

    try {
      // Delete the failed row so retry doesn't leave a duplicate behind.
      await fetch(`/api/songs/${song.id}`, { method: "DELETE" });

      const res = await fetch("/api/songs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtube_url: song.youtube_url }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to retry song");
        await fetchSongs();
        return;
      }

      await fetchSongs();
    } catch {
      setError("Failed to retry song");
    } finally {
      setRetryingSongId(null);
    }
  }

  return (
    <main className="flex-1">
      <div className="px-5 pt-4 pb-2.5">
        <p className="font-josefin text-[9px] uppercase tracking-[0.2em] text-text-muted">
          {loading
            ? "Loading..."
            : `${songs.length} song${songs.length !== 1 ? "s" : ""}`}
        </p>
        {error && (
          <p className="mt-2 font-josefin text-[11px] tracking-[0.08em] text-terracotta">
            {error}
          </p>
        )}
      </div>

      <div>
        {songs.map((song) => (
          <div
            key={song.id}
            className="flex items-center border-b border-border-darkest"
          >
            <button
              onClick={() => {
                if (song.status === "ready") {
                  router.push(`/song/${song.id}`);
                }
              }}
              className={`flex w-full items-center gap-3.5 border-none bg-transparent py-4 pl-5 pr-3 text-left transition-colors duration-200 ${
                song.status === "ready"
                  ? "cursor-pointer hover:bg-gold/5"
                  : "cursor-default"
              }`}
            >
              <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center border border-border">
                {song.status === "processing" ? (
                  <svg
                    className="spinning"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-text-muted)"
                    strokeWidth="2"
                  >
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                ) : song.status === "ready" ? (
                  <svg
                    width="12"
                    height="14"
                    viewBox="0 0 12 14"
                    fill="var(--color-text-muted)"
                  >
                    <path d="M0 0L12 7L0 14V0Z" />
                  </svg>
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-text-muted)"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="overflow-hidden text-ellipsis whitespace-nowrap font-playfair text-[14px] italic text-text">
                  {song.title}
                </p>
                <p className="mt-0.5 font-josefin text-[10px] font-thin uppercase tracking-[0.12em] text-text-dark">
                  {song.artist || "Unknown Artist"}
                </p>
              </div>

              <div className="shrink-0 text-right">
                {song.status === "processing" && (
                  <p className="font-josefin text-[9px] uppercase tracking-[0.15em] text-orange">
                    Processing
                  </p>
                )}
                {song.status === "queued" && (
                  <p className="font-josefin text-[9px] uppercase tracking-[0.15em] text-text-muted">
                    Queued
                  </p>
                )}
                {song.status === "failed" && (
                  <p className="font-josefin text-[9px] uppercase tracking-[0.15em] text-terracotta">
                    Failed
                  </p>
                )}
              </div>
            </button>
            {song.status === "failed" && (
              <button
                onClick={() => handleRetrySong(song)}
                disabled={
                  retryingSongId === song.id || deletingSongId === song.id
                }
                className="min-w-[64px] cursor-pointer border-none border-l border-l-border-darkest bg-transparent px-3.5 font-josefin text-[9px] uppercase tracking-[0.14em] text-gold disabled:cursor-default disabled:opacity-50"
              >
                {retryingSongId === song.id ? "..." : "Retry"}
              </button>
            )}
            <button
              data-confirm-target={song.id}
              onClick={() => handleDeleteSong(song)}
              disabled={deletingSongId === song.id}
              className={`min-w-[80px] cursor-pointer border-none border-l border-l-border-darkest px-3.5 font-josefin text-[9px] uppercase tracking-[0.14em] transition-colors duration-200 disabled:cursor-default disabled:opacity-50 ${
                confirmDeleteId === song.id
                  ? "bg-terracotta/10 text-terracotta"
                  : "bg-transparent text-text-muted"
              }`}
            >
              {deletingSongId === song.id
                ? "..."
                : confirmDeleteId === song.id
                  ? "Confirm?"
                  : "Delete"}
            </button>
          </div>
        ))}

        {!loading && songs.length === 0 && (
          <div className="px-5 py-10 text-center">
            <p className="font-josefin text-[12px] font-thin leading-[1.8] tracking-[0.1em] text-text-muted">
              No songs yet. Import one to get started.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
