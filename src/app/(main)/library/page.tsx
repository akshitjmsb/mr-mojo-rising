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

  // Reset delete confirmation when clicking outside that song row
  useEffect(() => {
    if (!confirmDeleteId) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(`[data-confirm-target="${confirmDeleteId}"]`)) {
        setConfirmDeleteId(null);
      }
    }
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
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
    <main style={{ flex: 1 }}>
        {/* Song count */}
        <div style={{ padding: "16px 20px 10px" }}>
          <p
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 9,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            {loading ? "Loading..." : `${songs.length} song${songs.length !== 1 ? "s" : ""}`}
          </p>
          {error && (
            <p
              style={{
                fontFamily: "var(--font-josefin), sans-serif",
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "var(--color-terracotta)",
                marginTop: 8,
              }}
            >
              {error}
            </p>
          )}
        </div>

        {/* Song list */}
        <div>
          {songs.map((song) => (
            <div
              key={song.id}
              style={{
                display: "flex",
                alignItems: "center",
                borderBottom: "1px solid var(--color-border-darkest)",
              }}
            >
              <button
                onClick={() => {
                  if (song.status === "ready") {
                    router.push(`/song/${song.id}`);
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "16px 12px 16px 20px",
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  cursor: song.status === "ready" ? "pointer" : "default",
                  textAlign: "left",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (song.status === "ready") {
                    e.currentTarget.style.background = "rgba(212,168,68,0.03)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {/* Play icon / Spinner */}
                <div
                  style={{
                    width: 38,
                    height: 38,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid var(--color-border)",
                    flexShrink: 0,
                  }}
                >
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

                {/* Song info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily: "var(--font-playfair), Georgia, serif",
                      fontSize: 14,
                      fontStyle: "italic",
                      color: "var(--color-text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {song.title}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-josefin), sans-serif",
                      fontSize: 10,
                      fontWeight: 100,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--color-text-dark)",
                      marginTop: 2,
                    }}
                  >
                    {song.artist || "Unknown Artist"}
                  </p>
                </div>

                {/* Status */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {song.status === "processing" && (
                    <p
                      style={{
                        fontFamily: "var(--font-josefin), sans-serif",
                        fontSize: 9,
                        letterSpacing: "0.15em",
                        textTransform: "uppercase",
                        color: "var(--color-orange)",
                      }}
                    >
                      Processing
                    </p>
                  )}
                  {song.status === "queued" && (
                    <p
                      style={{
                        fontFamily: "var(--font-josefin), sans-serif",
                        fontSize: 9,
                        letterSpacing: "0.15em",
                        textTransform: "uppercase",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      Queued
                    </p>
                  )}
                  {song.status === "failed" && (
                    <p
                      style={{
                        fontFamily: "var(--font-josefin), sans-serif",
                        fontSize: 9,
                        letterSpacing: "0.15em",
                        textTransform: "uppercase",
                        color: "var(--color-terracotta)",
                      }}
                    >
                      Failed
                    </p>
                  )}
                </div>
              </button>
              {song.status === "failed" && (
                <button
                  onClick={() => handleRetrySong(song)}
                  disabled={retryingSongId === song.id || deletingSongId === song.id}
                  style={{
                    fontFamily: "var(--font-josefin), sans-serif",
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--color-gold)",
                    background: "transparent",
                    border: "none",
                    borderLeft: "1px solid var(--color-border-darkest)",
                    padding: "0 14px",
                    minWidth: 64,
                    cursor: retryingSongId === song.id ? "default" : "pointer",
                    opacity: retryingSongId === song.id ? 0.5 : 1,
                  }}
                >
                  {retryingSongId === song.id ? "..." : "Retry"}
                </button>
              )}
              <button
                data-confirm-target={song.id}
                onClick={() => handleDeleteSong(song)}
                disabled={deletingSongId === song.id}
                style={{
                  fontFamily: "var(--font-josefin), sans-serif",
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color:
                    confirmDeleteId === song.id
                      ? "var(--color-terracotta)"
                      : "var(--color-text-muted)",
                  background:
                    confirmDeleteId === song.id ? "rgba(184,92,58,0.08)" : "transparent",
                  border: "none",
                  borderLeft: "1px solid var(--color-border-darkest)",
                  padding: "0 14px",
                  minWidth: 80,
                  cursor: deletingSongId === song.id ? "default" : "pointer",
                  opacity: deletingSongId === song.id ? 0.5 : 1,
                  transition: "color 0.2s, background 0.2s",
                }}
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
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <p
                style={{
                  fontFamily: "var(--font-josefin), sans-serif",
                  fontSize: 12,
                  fontWeight: 100,
                  letterSpacing: "0.1em",
                  color: "var(--color-text-muted)",
                  lineHeight: 1.8,
                }}
              >
                No songs yet. Import one to get started.
              </p>
            </div>
          )}
        </div>
    </main>
  );
}
