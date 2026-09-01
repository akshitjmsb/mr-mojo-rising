"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Song } from "@/lib/database.types";
import { isLessonReady } from "@/lib/import-progress";
import { groupSongsByArtist } from "@/lib/song-catalog";
import StorageMeter from "./StorageMeter";

type LearnSong = Song & {
  worker_online_count?: number;
  latest_worker_heartbeat_at?: number | null;
  preview_ready?: number;
};

function pendingLabel(song: LearnSong, workerOnline: boolean) {
  if (song.status === "processing") return "Processing";
  if (song.status === "ready") return "Finalizing";
  if (song.status === "queued") return workerOnline ? "Queued" : "Mac offline";
  return "Failed";
}

export default function LearnLibrary() {
  const router = useRouter();
  const [songs, setSongs] = useState<LearnSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [retryingSongId, setRetryingSongId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [storageRefreshKey, setStorageRefreshKey] = useState(0);

  const fetchSongs = useCallback(async () => {
    try {
      const res = await fetch("/api/songs");
      const data = await res.json();
      setSongs(Array.isArray(data) ? (data as LearnSong[]) : []);
    } catch {
      setError("Failed to refresh songs");
    }
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

  const hasActiveSongs = songs.some(
    (song) => song.status !== "failed" && !isLessonReady(song),
  );

  useEffect(() => {
    if (!hasActiveSongs) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      await fetchSongs();
      if (!cancelled) timer = setTimeout(poll, 3000);
    }

    timer = setTimeout(poll, 3000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchSongs, hasActiveSongs]);

  useEffect(() => {
    if (!activeSongId) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(`[data-song-actions="${activeSongId}"]`)) {
        setActiveSongId(null);
        setConfirmDeleteId(null);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [activeSongId]);

  async function handleDeleteSong(song: LearnSong) {
    if (confirmDeleteId !== song.id) {
      setConfirmDeleteId(song.id);
      return;
    }

    setError("");
    setConfirmDeleteId(null);
    setActiveSongId(null);
    setDeletingSongId(song.id);

    try {
      const res = await fetch(`/api/songs/${song.id}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to delete song");
        return;
      }

      setSongs((prev) => prev.filter((item) => item.id !== song.id));
      setStorageRefreshKey((current) => current + 1);
    } catch {
      setError("Failed to delete song");
    } finally {
      setDeletingSongId(null);
    }
  }

  async function handleRetrySong(song: LearnSong) {
    setError("");
    setRetryingSongId(song.id);

    try {
      const res = await fetch(`/api/songs/${song.id}/retry`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to retry song");
      }
      await fetchSongs();
    } catch {
      setError("Failed to retry song");
    } finally {
      setRetryingSongId(null);
      setActiveSongId(null);
    }
  }

  const artistGroups = useMemo(() => groupSongsByArtist(songs), [songs]);

  return (
    <main className="flex-1">
      <div className="px-5 pt-4 pb-2">
        <h1 className="font-playfair text-[22px] italic text-text">
          Your songs
        </h1>
        {loading && (
          <p className="mt-1 font-josefin text-[8px] uppercase tracking-[0.16em] text-text-dark">
            Loading…
          </p>
        )}
        {error && (
          <p className="mt-2 font-josefin text-[11px] tracking-[0.08em] text-terracotta">
            {error}
          </p>
        )}
      </div>

      <StorageMeter refreshKey={storageRefreshKey} />

      <div className="pb-4">
        {artistGroups.map((group, groupIndex) => {
          const headingId = `artist-${groupIndex}`;
          return (
            <section key={group.artist} aria-labelledby={headingId}>
              <div className="px-5 pt-5 pb-1.5">
                <h2
                  id={headingId}
                  className="font-josefin text-[9px] uppercase tracking-[0.16em] text-gold"
                >
                  {group.artist}
                </h2>
              </div>

              {group.songs.map((song) => {
                const workerOnline = (song.worker_online_count ?? 0) > 0;
                const playable = isLessonReady(song);
                const actionsOpen = activeSongId === song.id;

                return (
                  <div
                    key={song.id}
                    data-song-actions={song.id}
                    className="flex min-h-12 items-center border-b border-border-darkest px-5"
                  >
                    <button
                      onClick={() => {
                        if (playable) router.push(`/song/${song.id}`);
                      }}
                      className={`min-w-0 flex-1 border-none bg-transparent py-3 pr-3 text-left ${
                        playable
                          ? "cursor-pointer hover:text-gold"
                          : "cursor-default"
                      }`}
                    >
                      <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-playfair text-[15px] italic text-text">
                        {song.title}
                      </span>
                    </button>

                    {!playable && (
                      <p
                        className={`shrink-0 font-josefin text-[7px] uppercase tracking-[0.12em] ${
                          song.status === "failed"
                            ? "text-terracotta"
                            : "text-orange"
                        }`}
                      >
                        {pendingLabel(song, workerOnline)}
                      </p>
                    )}

                    {actionsOpen && song.status === "failed" && (
                      <button
                        onClick={() => handleRetrySong(song)}
                        disabled={
                          retryingSongId === song.id ||
                          deletingSongId === song.id
                        }
                        className="h-11 cursor-pointer border-none bg-transparent px-2 font-josefin text-[8px] uppercase tracking-[0.12em] text-gold disabled:cursor-default disabled:opacity-50"
                      >
                        {retryingSongId === song.id ? "…" : "Retry"}
                      </button>
                    )}

                    {actionsOpen && (
                      <button
                        onClick={() => handleDeleteSong(song)}
                        disabled={deletingSongId === song.id}
                        className="h-11 cursor-pointer border-none bg-transparent px-2 font-josefin text-[8px] uppercase tracking-[0.12em] text-terracotta disabled:cursor-default disabled:opacity-50"
                      >
                        {deletingSongId === song.id
                          ? "…"
                          : confirmDeleteId === song.id
                            ? "Delete?"
                            : "Delete"}
                      </button>
                    )}

                    <button
                      aria-label={`Actions for ${song.title}`}
                      aria-expanded={actionsOpen}
                      onClick={() => {
                        setActiveSongId((current) =>
                          current === song.id ? null : song.id,
                        );
                        setConfirmDeleteId(null);
                      }}
                      className="flex h-11 w-9 shrink-0 cursor-pointer items-center justify-end border-none bg-transparent font-josefin text-[13px] tracking-[0.12em] text-text-dark"
                    >
                      ···
                    </button>
                  </div>
                );
              })}
            </section>
          );
        })}

        {!loading && songs.length === 0 && (
          <p className="px-5 py-10 text-center font-josefin text-[11px] tracking-[0.08em] text-text-muted">
            No songs yet
          </p>
        )}
      </div>
    </main>
  );
}
