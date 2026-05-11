"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Song } from "@/lib/database.types";
import type { ResolvedLink, YouTubeSearchResult } from "@/lib/intake";
import { useTheme } from "@/lib/theme/ThemeProvider";

function looksLikeUrl(s: string) {
  const t = s.trim();
  if (!t) return false;
  return /^https?:\/\//i.test(t) || /^(www\.)?(youtu|spotify|open\.spotify)/i.test(t);
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { content } = useTheme();
  const QUOTES = content.searchQuotes;

  const [urlInput, setUrlInput] = useState("");
  const [searchInput, setSearchInput] = useState("");

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
  const [quoteIndex, setQuoteIndex] = useState(0);
  const importingSongIdRef = useRef<string | null>(null);

  const handledShareUrlRef = useRef<string | null>(null);

  type ImportStatus = Pick<Song, "id" | "status" | "last_error" | "processing_stage"> & {
    job_status?: string | null;
    attempt_count?: number | null;
    max_attempts?: number | null;
    queue_position?: number | null;
    worker_online_count?: number;
  };

  const resolveUrl = useCallback(async (raw: string): Promise<ResolvedLink | null> => {
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
  }, []);

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
    setUrlInput(extracted);
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
        if (next.status === "ready") {
          importingSongIdRef.current = null;
          router.push(`/song/${next.id}`);
        } else if (next.status === "failed") {
          importingSongIdRef.current = null;
          setSubmitError(next.last_error || "Processing failed.");
          setSubmitting(false);
          setImportingSongId(null);
        } else if (next.job_status === "queued" || next.job_status === "retryable") {
          const position = next.queue_position ?? 1;
          const workerOnline = (next.worker_online_count ?? 0) > 0;
          const retryText =
            next.job_status === "retryable" && next.attempt_count && next.max_attempts
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
            next.processing_stage
              ? `Processing: ${next.processing_stage}. The player will open when it's ready.`
              : "Processing. The player will open when it's ready.",
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

  // Rotate quote while submitting.
  useEffect(() => {
    if (!submitting) return;
    const id = setInterval(
      () => setQuoteIndex((i) => (i + 1) % QUOTES.length),
      4000,
    );
    return () => clearInterval(id);
  }, [submitting, QUOTES.length]);

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = urlInput.trim();
    if (!raw) return;
    if (!looksLikeUrl(raw)) {
      setResolveError("Paste a YouTube or Spotify link.");
      return;
    }
    const out = await resolveUrl(raw);
    if (out) setResolved(out);
  }

  async function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) return;

    lastSearchRef.current?.abort();
    const ctrl = new AbortController();
    lastSearchRef.current = ctrl;

    setSearchError("");
    setSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(q)}`,
        { signal: ctrl.signal },
      );
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || "Search failed.");
        return;
      }
      setSearchResults((data.results as YouTubeSearchResult[]) ?? []);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setSearchError("Could not reach the search service.");
    } finally {
      setSearching(false);
    }
  }

  async function submitForProcessing(youtube_url: string, title: string) {
    setSubmitError("");
    setSubmitting(true);
    setImportingTitle(title);
    setImportStatusText("Queued for processing.");
    setQuoteIndex(0);
    try {
      const res = await fetch("/api/songs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtube_url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to queue song.");
        setSubmitting(false);
        return;
      }
      const songId = data.id as string;
      importingSongIdRef.current = songId;
      setImportingSongId(songId);
    } catch {
      setSubmitError("Could not connect to the server.");
      setSubmitting(false);
    }
  }

  function handleConfirmAdd() {
    if (!resolved) return;
    const titleForUi =
      resolved.source === "spotify" && resolved.spotifyTitle
        ? resolved.spotifyTitle
        : resolved.title;
    submitForProcessing(resolved.youtube_url, titleForUi);
    setResolved(null);
    setUrlInput("");
  }

  function handleResultTap(result: YouTubeSearchResult) {
    submitForProcessing(result.url, result.title);
    setSearchResults([]);
    setSearchInput("");
  }

  function handleCancelSubmit() {
    const songId = importingSongIdRef.current;
    importingSongIdRef.current = null;
    setSubmitting(false);
    setImportingSongId(null);
    if (songId) {
      fetch(`/api/songs/${songId}`, { method: "DELETE" }).catch(() => {});
    }
  }

  // Submitting state — block input, show shared progress card.
  if (submitting) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex flex-col items-center gap-5 text-center">
          <svg
            className="spinning"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="2"
          >
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          <p className="font-playfair text-[20px] font-bold italic leading-[1.3] text-gold">
            Adding to your library...
          </p>
          {importingTitle && (
            <p className="-mt-3 max-w-[320px] font-josefin text-[12px] tracking-[0.06em] text-text-muted">
              {importingTitle}
            </p>
          )}
          <p
            key={quoteIndex}
            className="fade-up min-h-5 font-playfair text-[14px] italic text-text-muted opacity-75"
          >
            &ldquo;{QUOTES[quoteIndex]}&rdquo;
          </p>
          <p className="font-josefin text-[10px] uppercase tracking-[0.2em] text-text-dark">
            {importStatusText}
          </p>
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
      </div>

      {/* URL paste */}
      <form onSubmit={handleUrlSubmit} className="flex flex-col gap-2.5">
        <p className="font-josefin text-[10px] uppercase tracking-[0.22em] text-text-muted">
          Paste a link
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="youtube.com/... or open.spotify.com/track/..."
            disabled={resolving}
            className="min-w-0 flex-1 bg-input-bg border border-border px-3.5 py-3 font-josefin text-[12px] tracking-[0.04em] text-text outline-none"
          />
          <button
            type="submit"
            disabled={resolving || !urlInput.trim()}
            className="shrink-0 border border-gold bg-transparent px-4 py-3 font-josefin text-[10px] uppercase tracking-[0.2em] text-gold transition-opacity duration-300 disabled:cursor-default disabled:opacity-50"
          >
            {resolving ? "..." : "Resolve"}
          </button>
        </div>
        {resolveError && (
          <p className="font-josefin text-[11px] tracking-[0.06em] text-terracotta">
            {resolveError}
          </p>
        )}
      </form>

      {/* Confirmation card */}
      {resolved && (
        <div className="flex flex-col gap-3 border border-gold bg-gold/5 p-4">
          <p className="font-josefin text-[10px] uppercase tracking-[0.22em] text-gold">
            {resolved.source === "spotify"
              ? "Matched from Spotify"
              : "From YouTube"}
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
              {resolved.source === "spotify" && resolved.spotifyTitle && (
                <p className="mt-1 font-josefin text-[10px] tracking-[0.06em] text-text-muted">
                  Spotify: {resolved.spotifyTitle}
                </p>
              )}
            </div>
          </div>
          <p className="font-josefin text-[12px] tracking-[0.06em] text-text-secondary">
            Add this to your library?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmAdd}
              className="flex-1 cursor-pointer border border-gold bg-gold/10 px-4 py-3 font-josefin text-[10px] uppercase tracking-[0.2em] text-gold"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setResolved(null);
                setUrlInput("");
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

      {/* YouTube search */}
      <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2.5">
        <p className="font-josefin text-[10px] uppercase tracking-[0.22em] text-text-muted">
          Search YouTube
        </p>
        <div className="flex gap-2">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="song or artist"
            inputMode="search"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-input-bg border border-border px-3.5 py-3 font-josefin text-[12px] tracking-[0.04em] text-text outline-none"
          />
          <button
            type="submit"
            disabled={searching || !searchInput.trim()}
            className="shrink-0 border border-gold bg-transparent px-4 py-3 font-josefin text-[10px] uppercase tracking-[0.2em] text-gold transition-opacity duration-300 disabled:cursor-default disabled:opacity-50"
          >
            {searching ? "..." : "Search"}
          </button>
        </div>
        {searchError && (
          <p className="font-josefin text-[11px] tracking-[0.06em] text-terracotta">
            {searchError}
          </p>
        )}
      </form>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="-mx-6">
          {searchResults.map((r) => (
            <button
              key={r.videoId}
              type="button"
              onClick={() => handleResultTap(r)}
              className="flex w-full cursor-pointer items-start gap-3 border-b border-border-darkest px-5 py-3 text-left transition-colors duration-200 hover:bg-gold/5"
            >
              {r.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.thumbnail}
                  alt=""
                  className="h-[54px] w-[96px] shrink-0 object-cover"
                />
              ) : (
                <div className="h-[54px] w-[96px] shrink-0 border border-border-dark bg-input-bg" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className="font-playfair text-[13px] italic leading-[1.3] text-text"
                  // wrap up to 2 lines via line-clamp utility
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {r.title}
                </p>
                <p className="mt-1 font-josefin text-[10px] uppercase tracking-[0.14em] text-text-dark">
                  {r.channel}
                  {r.durationLabel ? ` · ${r.durationLabel}` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {!searching && searchResults.length === 0 && !resolved && !urlInput && !searchInput && (
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

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageInner />
    </Suspense>
  );
}
