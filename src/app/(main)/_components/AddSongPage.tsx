"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SongProcessingProgress from "@/components/SongProcessingProgress";
import SongReadyNotification from "@/components/SongReadyNotification";
import type { Song } from "@/lib/database.types";
import { fetchJson, HttpResponseError } from "@/lib/fetch-json";
import { isLessonReady } from "@/lib/import-progress";
import type { ResolvedLink, YouTubeSearchResult } from "@/lib/intake";
import { useTheme } from "@/lib/theme/ThemeProvider";
import StorageMeter from "./StorageMeter";

type ImportStatus = Pick<
  Song,
  "id" | "status" | "last_error" | "processing_stage"
> & {
  job_status?: string | null;
  attempt_count?: number | null;
  max_attempts?: number | null;
  queue_position?: number | null;
  worker_online_count?: number;
  preview_ready?: number;
};

function looksLikeUrl(s: string) {
  const t = s.trim();
  if (!t) return false;
  return (
    /^https?:\/\//i.test(t) || /^(www\.)?(youtube\.com|youtu\.be)/i.test(t)
  );
}

function youtubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1);
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

function AddSongPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { content } = useTheme();

  const [input, setInput] = useState("");
  const [librarySongs, setLibrarySongs] = useState<Song[]>([]);

  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<ResolvedLink | null>(null);
  const [resolveError, setResolveError] = useState("");

  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const lastSearchRef = useRef<AbortController | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [importingSongId, setImportingSongId] = useState<string | null>(null);
  const [importingTitle, setImportingTitle] = useState("");
  const [importStatusText, setImportStatusText] = useState(
    "Hang tight — the player will open when it's ready.",
  );
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);
  const importingSongIdRef = useRef<string | null>(null);

  const handledShareUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/songs", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((songs: unknown) => {
        if (!cancelled && Array.isArray(songs))
          setLibrarySongs(songs as Song[]);
      })
      .catch(() => {
        // Duplicate detection is helpful, but never blocks adding a song.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveUrl = useCallback(
    async (raw: string): Promise<ResolvedLink | null> => {
      setResolveError("");
      setResolving(true);
      try {
        const res = await fetch("/api/resolve-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: raw }),
        });
        const data = await res.json();
        if (!res.ok) {
          setResolveError(data.error || "Could not understand that link.");
          return null;
        }
        return data as ResolvedLink;
      } catch {
        setResolveError("Network error reaching the server.");
        return null;
      } finally {
        setResolving(false);
      }
    },
    [],
  );

  // Honor share-target params on mount. iOS often packs the link in `text`
  // (or even `title`) rather than `url`, so dig a URL out of any of them.
  useEffect(() => {
    const sharedUrl = searchParams.get("url");
    const sharedText = searchParams.get("text");
    const sharedTitle = searchParams.get("title");
    const candidates = [sharedUrl, sharedText, sharedTitle].filter(
      (v): v is string => !!v,
    );
    if (candidates.length === 0) return;

    let extracted: string | null = null;
    for (const c of candidates) {
      const trimmed = c.trim();
      if (/^https?:\/\//i.test(trimmed)) {
        extracted = trimmed;
        break;
      }
      const match = trimmed.match(/https?:\/\/\S+/);
      if (match) {
        extracted = match[0];
        break;
      }
    }
    if (!extracted) return;
    if (handledShareUrlRef.current === extracted) return;
    handledShareUrlRef.current = extracted;
    setInput(extracted);
    (async () => {
      const out = await resolveUrl(extracted);
      if (out) setResolved(out);
    })();
  }, [searchParams, resolveUrl]);

  // Poll the song's status once submitted, so we can route to the player on
  // ready (or surface failure).
  useEffect(() => {
    if (!importingSongId) return;
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`/api/songs/${importingSongId}/status`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const next = (await res.json()) as ImportStatus;
        if (cancelled) return;
        setImportStatus(next);
        if (isLessonReady(next)) {
          importingSongIdRef.current = null;
          router.push(`/song/${next.id}`);
        } else if (next.status === "failed") {
          importingSongIdRef.current = null;
          setSubmitError(next.last_error || "Processing failed.");
          setSubmitting(false);
          setImportingSongId(null);
        } else if (
          next.job_status === "queued" ||
          next.job_status === "retryable"
        ) {
          const position = next.queue_position ?? 1;
          const workerOnline = (next.worker_online_count ?? 0) > 0;
          const retryText =
            next.job_status === "retryable" &&
            next.attempt_count &&
            next.max_attempts
              ? ` Retry ${next.attempt_count + 1} of ${next.max_attempts} is scheduled.`
              : "";
          setImportStatusText(
            !workerOnline
              ? "Queued, but the Mac worker looks offline. Start Mr. Mojo Rising on the Mac to process it."
              : position > 1
                ? `Queued behind ${position - 1} song${position === 2 ? "" : "s"}.${retryText}`
                : `Queued for processing.${retryText}`,
          );
        } else if (next.status === "processing") {
          setImportStatusText(
            next.processing_stage === "download"
              ? "The source audio is being downloaded."
              : next.processing_stage === "separate"
                ? "This is the intensive step; each instrument is being separated."
                : next.processing_stage === "preview_upload"
                  ? "The first separation is saved. Song Map stays closed until every step is complete."
                  : next.processing_stage === "refine"
                    ? "The separated instrument layers are being cleaned and refined."
                    : next.processing_stage === "quality_gate"
                      ? "The final audio is being checked for timing, clipping, leakage, and separation."
                    : "Song sections, timing, notes, and chords are being checked before Song Map opens.",
          );
        }
      } catch {
        // Network blip — will retry on next interval.
      }
    }

    check();
    const interval = setInterval(check, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [importingSongId, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value) return;

    setResolveError("");
    setSearchError("");
    setSubmitError("");
    setResolved(null);
    setSearchResults([]);

    if (looksLikeUrl(value)) {
      const out = await resolveUrl(value);
      if (out) setResolved(out);
      return;
    }

    lastSearchRef.current?.abort();
    const ctrl = new AbortController();
    lastSearchRef.current = ctrl;

    setSearchError("");
    setSearching(true);
    setSearchResults([]);
    try {
      const data = await fetchJson<{ results?: YouTubeSearchResult[] }>(
        `/api/youtube/search?q=${encodeURIComponent(value)}`,
        { signal: ctrl.signal, attempts: 2 },
      );
      setSearchResults(data.results ?? []);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setSearchError(
        err instanceof HttpResponseError
          ? err.message
          : "Connection interrupted. Search again.",
      );
    } finally {
      if (lastSearchRef.current === ctrl) {
        lastSearchRef.current = null;
        setSearching(false);
      }
    }
  }

  async function submitForProcessing(youtube_url: string, title: string) {
    setSubmitError("");
    setSubmitting(true);
    setImportingTitle(title);
    setImportStatusText("Queued for processing.");
    setImportStatus(null);
    try {
      const data = await fetchJson<{
        id: string;
        status?: Song["status"];
      }>("/api/songs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtube_url }),
        attempts: 3,
      });
      const songId = data.id as string;
      const initialStatus: Song["status"] =
        data.status === "ready"
          ? "ready"
          : data.status === "processing"
            ? "processing"
            : "queued";
      setImportStatus({
        id: songId,
        status: initialStatus,
        processing_stage: initialStatus === "ready" ? "complete" : "queued",
        last_error: null,
        job_status: initialStatus === "ready" ? "succeeded" : "queued",
      });
      importingSongIdRef.current = songId;
      setImportingSongId(songId);
    } catch (error) {
      setSubmitError(
        error instanceof HttpResponseError
          ? error.message
          : "Connection interrupted. Tap the song to try again.",
      );
      setSubmitting(false);
    }
  }

  function handleConfirmAdd() {
    if (!resolved) return;
    submitForProcessing(resolved.youtube_url, resolved.title);
    setResolved(null);
    setInput("");
  }

  function handleResultTap(result: YouTubeSearchResult) {
    submitForProcessing(result.url, result.title);
    setSearchResults([]);
    setInput("");
  }

  function existingSongForUrl(url: string) {
    const videoId = youtubeVideoId(url);
    return librarySongs.find((song) => {
      if (song.youtube_url === url) return true;
      return videoId !== null && youtubeVideoId(song.youtube_url) === videoId;
    });
  }

  function handleCancelSubmit() {
    const songId = importingSongIdRef.current;
    importingSongIdRef.current = null;
    setSubmitting(false);
    setImportingSongId(null);
    setImportStatus(null);
    if (songId) {
      fetch(`/api/songs/${songId}`, { method: "DELETE" }).catch(() => {});
    }
  }

  const busy = resolving || searching;
  const resolvedExistingSong = resolved
    ? existingSongForUrl(resolved.youtube_url)
    : null;
  const resolvedExistingSongReady = isLessonReady(resolvedExistingSong);

  // Submitting state — block input, show shared progress card.
  if (submitting) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex flex-col items-center gap-5 text-center">
          <p className="font-playfair text-[20px] font-bold italic leading-[1.3] text-gold">
            Adding your song...
          </p>
          {importingTitle && (
            <p className="-mt-3 max-w-[320px] font-josefin text-[12px] tracking-[0.06em] text-text-muted">
              {importingTitle}
            </p>
          )}
          <SongProcessingProgress
            status={importStatus}
            detail={importStatusText}
          />
          <SongReadyNotification songId={importingSongId} />
          <button
            type="button"
            onClick={handleCancelSubmit}
            className="cursor-pointer border-none bg-transparent px-2 py-1 font-josefin text-[10px] font-light uppercase tracking-[0.18em] text-text-muted underline underline-offset-4"
          >
            Cancel
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-7 p-6">
      <div>
        <p className="font-playfair text-[26px] font-bold italic leading-[1.25] text-text">
          {content.searchHero.title}
        </p>
        <p className="mt-2.5 font-josefin text-[12px] font-light leading-[1.8] tracking-[0.1em] text-text-muted">
          {content.searchHero.subtitle}
        </p>
        <div className="mt-3">
          <StorageMeter refreshKey={0} mode="capacity" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        <p className="font-josefin text-[10px] uppercase tracking-[0.22em] text-text-muted">
          Song, artist, or link
        </p>
        <div className="flex gap-2">
          <input
            type="search"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setResolveError("");
              setSearchError("");
              setSubmitError("");
            }}
            placeholder="Patience Guns N’ Roses, or paste a link"
            inputMode="search"
            enterKeyHint={looksLikeUrl(input) ? "go" : "search"}
            disabled={busy}
            aria-describedby="add-song-hint"
            className="min-w-0 flex-1 bg-input-bg border border-border px-3.5 py-3 font-josefin text-[12px] tracking-[0.04em] text-text outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="shrink-0 border border-gold bg-transparent px-4 py-3 font-josefin text-[10px] uppercase tracking-[0.2em] text-gold transition-opacity duration-300 disabled:cursor-default disabled:opacity-50"
          >
            {busy ? "..." : looksLikeUrl(input) ? "Check" : "Search"}
          </button>
        </div>
        <p
          id="add-song-hint"
          className="font-josefin text-[9px] font-thin leading-relaxed tracking-[0.06em] text-text-dark"
        >
          {looksLikeUrl(input)
            ? "YouTube links are detected automatically."
            : "Searching YouTube."}
        </p>
        {resolveError && (
          <p className="font-josefin text-[11px] tracking-[0.06em] text-terracotta">
            {resolveError}
          </p>
        )}
        {searchError && (
          <p className="font-josefin text-[11px] tracking-[0.06em] text-terracotta">
            {searchError}
          </p>
        )}
      </form>

      {/* Confirmation card */}
      {resolved && (
        <div className="flex flex-col gap-3 border border-gold bg-gold/5 p-4">
          <p className="font-josefin text-[10px] uppercase tracking-[0.22em] text-gold">
            From YouTube
          </p>
          <div className="flex items-start gap-3">
            {resolved.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolved.thumbnail}
                alt=""
                className="h-[54px] w-[96px] shrink-0 object-cover"
              />
            ) : (
              <div className="h-[54px] w-[96px] shrink-0 border border-border-dark bg-input-bg" />
            )}
            <div className="min-w-0 flex-1">
              <p className="overflow-hidden text-ellipsis font-playfair text-[14px] italic text-text">
                {resolved.title}
              </p>
              {resolved.channel && (
                <p className="mt-1 font-josefin text-[10px] uppercase tracking-[0.14em] text-text-dark">
                  {resolved.channel}
                </p>
              )}
            </div>
          </div>
          <p className="font-josefin text-[12px] tracking-[0.06em] text-text-secondary">
            {resolvedExistingSong
              ? resolvedExistingSongReady
                ? "This song is already mapped."
                : "This song is already being prepared."
              : "Add this song?"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (resolvedExistingSong) {
                  router.push(
                    resolvedExistingSongReady
                      ? `/song/${resolvedExistingSong.id}`
                      : "/practice",
                  );
                } else {
                  handleConfirmAdd();
                }
              }}
              className="flex-1 cursor-pointer border border-gold bg-gold/10 px-4 py-3 font-josefin text-[10px] uppercase tracking-[0.2em] text-gold"
            >
              {resolvedExistingSong
                ? resolvedExistingSongReady
                  ? "Open song"
                  : "View in Learn"
                : "Add song"}
            </button>
            <button
              type="button"
              onClick={() => {
                setResolved(null);
                setInput("");
              }}
              className="cursor-pointer border border-border-dark bg-transparent px-4 py-3 font-josefin text-[10px] uppercase tracking-[0.2em] text-text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {submitError && !submitting && (
        <p className="font-josefin text-[11px] tracking-[0.06em] text-terracotta">
          {submitError}
        </p>
      )}

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="-mx-6" aria-label="YouTube results">
          {searchResults.map((result) => {
            const existingSong = existingSongForUrl(result.url);
            const existingSongReady = isLessonReady(existingSong);
            return (
              <button
                key={result.videoId}
                type="button"
                onClick={() => {
                  if (existingSong) {
                    router.push(
                      existingSongReady
                        ? `/song/${existingSong.id}`
                        : "/practice",
                    );
                  } else {
                    handleResultTap(result);
                  }
                }}
                className="flex w-full cursor-pointer items-start gap-3 border-b border-border-darkest px-5 py-3 text-left transition-colors duration-200 hover:bg-gold/5"
              >
                {result.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={result.thumbnail}
                    alt=""
                    className="h-[54px] w-[96px] shrink-0 object-cover"
                  />
                ) : (
                  <div className="h-[54px] w-[96px] shrink-0 border border-border-dark bg-input-bg" />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className="font-playfair text-[13px] italic leading-[1.3] text-text"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {result.title}
                  </p>
                  <p className="mt-1 font-josefin text-[10px] uppercase tracking-[0.14em] text-text-dark">
                    {result.channel}
                    {result.durationLabel ? ` · ${result.durationLabel}` : ""}
                  </p>
                  <p
                    className={`mt-1.5 font-josefin text-[8px] uppercase tracking-[0.14em] ${
                      existingSong ? "text-text-muted" : "text-gold"
                    }`}
                  >
                    {existingSong
                      ? existingSongReady
                        ? "Already added · Open"
                        : "Already added · Processing"
                      : "Add song"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!searching && searchResults.length === 0 && !resolved && !input && (
        <div className="flex flex-col gap-2.5 border border-border-darkest bg-input-bg/40 p-4">
          <p className="font-josefin text-[10px] uppercase tracking-[0.2em] text-gold">
            Tip
          </p>
          <p className="font-josefin text-[12px] leading-[1.7] tracking-[0.04em] text-text-muted">
            {content.shareTip}
          </p>
        </div>
      )}
    </main>
  );
}

export default function AddSongPage() {
  return (
    <Suspense fallback={null}>
      <AddSongPageInner />
    </Suspense>
  );
}
