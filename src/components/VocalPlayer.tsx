"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { vocalOrder, type VocalTrack } from "@/lib/vocal-queue";

type Player = {
  tracks: VocalTrack[];
  current: VocalTrack | null;
  playing: boolean;
  loading: boolean;
  shuffle: boolean;
  time: number;
  duration: number;
  error: string;
  start: (id?: string) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  setShuffle: () => void;
  seek: (time: number) => void;
  refresh: () => Promise<void>;
};

const Context = createContext<Player | null>(null);
export function useVocalPlayer() {
  const player = useContext(Context);
  if (!player) throw new Error("Vocal player is not mounted");
  return player;
}

export function VocalPlayerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [tracks, setTracks] = useState<VocalTrack[]>([]);
  const [current, setCurrent] = useState<VocalTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shuffle, updateShuffle] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  const tracksRef = useRef<VocalTrack[]>([]);
  const currentRef = useRef<VocalTrack | null>(null);
  const queue = useRef<string[]>([]);
  const index = useRef(0);
  const shuffled = useRef(false);
  const failed = useRef(new Set<string>());
  const request = useRef(0);
  const ownsAudio = !pathname.startsWith("/song/") && !pathname.startsWith("/tuner");

  async function refresh() {
    if (!tracksRef.current.length) setLoading(true);
    try {
      const response = await fetch("/api/player", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load your songs. Try again.");
      const rows: VocalTrack[] = await response.json();
      tracksRef.current = rows;
      setTracks(rows);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your songs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (pathname === "/player" || !tracksRef.current.length) void refresh();
  }, [pathname]);

  function pause() {
    request.current++;
    audio.current?.pause();
    setPlaying(false);
  }

  function play() {
    const element = audio.current;
    if (!element?.src) return;
    const version = ++request.current;
    void element.play().catch((e: DOMException) => {
      if (version !== request.current || e.name === "AbortError") return;
      setPlaying(false);
      setError(e.name === "NotAllowedError" ? "Tap Play to continue listening." : "Playback stopped. Tap Play to retry.");
    });
  }

  function playTrack(id: string) {
    const track = tracksRef.current.find((item) => item.id === id);
    const element = audio.current;
    if (!track || !element) return;
    request.current++;
    currentRef.current = track;
    setCurrent(track);
    setTime(0);
    setDuration(0);
    setError("");
    // Reuse one media element and already-loaded URLs so ended can advance
    // synchronously, including while the phone is locked.
    element.src = track.url;
    element.playbackRate = 1;
    element.load();
    play();
  }

  function start(id?: string) {
    if (!tracksRef.current.length) return;
    failed.current.clear();
    if (!id && currentRef.current) {
      setError("");
      if (audio.current?.error) playTrack(currentRef.current.id);
      else play();
      return;
    }
    queue.current = vocalOrder(tracksRef.current.map((track) => track.id), shuffled.current);
    if (id && shuffled.current) queue.current = [id, ...queue.current.filter((key) => key !== id)];
    index.current = id ? Math.max(0, queue.current.indexOf(id)) : 0;
    playTrack(queue.current[index.current]);
  }

  function next() {
    const available = tracksRef.current.filter((track) => !failed.current.has(track.id)).map((track) => track.id);
    if (!available.length) {
      pause();
      setError("Your vocal tracks could not be played. Check your connection and tap Play to retry.");
      return;
    }
    let nextIndex = index.current + 1;
    while (nextIndex < queue.current.length && !available.includes(queue.current[nextIndex])) nextIndex++;
    if (nextIndex >= queue.current.length) {
      queue.current = vocalOrder(available, shuffled.current, currentRef.current?.id);
      nextIndex = 0;
    }
    index.current = nextIndex;
    playTrack(queue.current[nextIndex]);
  }

  function previous() {
    if (!currentRef.current) { start(); return; }
    if ((audio.current?.currentTime ?? 0) > 3) { seek(0); return; }
    index.current = (index.current - 1 + queue.current.length) % queue.current.length;
    playTrack(queue.current[index.current]);
  }

  function seek(position: number) {
    const element = audio.current;
    if (!element || !Number.isFinite(element.duration)) return;
    element.currentTime = Math.max(0, Math.min(element.duration, position));
    setTime(element.currentTime);
  }

  function setShuffle() {
    shuffled.current = !shuffled.current;
    updateShuffle(shuffled.current);
    const ids = tracksRef.current.map((track) => track.id);
    const id = currentRef.current?.id;
    queue.current = vocalOrder(ids, shuffled.current);
    if (id && shuffled.current) queue.current = [id, ...queue.current.filter((key) => key !== id)];
    index.current = id ? Math.max(0, queue.current.indexOf(id)) : 0;
  }

  const controls = useRef({ play, pause, next, previous, seek });
  useEffect(() => { controls.current = { play, pause, next, previous, seek }; });

  useEffect(() => {
    if (!ownsAudio) {
      controls.current.pause();
      currentRef.current = null;
      setCurrent(null);
    }
  }, [ownsAudio]);

  useEffect(() => {
    if (!ownsAudio || !current || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({ title: current.title, artist: current.artist ?? "", album: "Mr. Mojo Rising · Vocals" });
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => controls.current.play(), pause: () => controls.current.pause(),
      nexttrack: () => controls.current.next(), previoustrack: () => controls.current.previous(),
      seekto: (event) => { if (event.seekTime !== undefined) controls.current.seek(event.seekTime); },
      seekbackward: (event) => controls.current.seek((audio.current?.currentTime ?? 0) - (event.seekOffset ?? 10)),
      seekforward: (event) => controls.current.seek((audio.current?.currentTime ?? 0) + (event.seekOffset ?? 10)),
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try { session.setActionHandler(action as MediaSessionAction, handler); } catch { /* Optional browser support. */ }
    }
    return () => {
      for (const action of Object.keys(handlers)) {
        try { session.setActionHandler(action as MediaSessionAction, null); } catch { /* Optional browser support. */ }
      }
    };
  }, [current, ownsAudio]);

  useEffect(() => {
    if (ownsAudio && current && "mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing, ownsAudio, current]);

  const value: Player = { tracks, current, playing, loading, shuffle, time, duration, error, start,
    toggle: () => { if (audio.current?.paused) start(); else pause(); },
    next, previous, seek, setShuffle, refresh };

  return (
    <Context.Provider value={value}>
      {children}
      <audio ref={audio} preload="auto" playsInline
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={next}
        onTimeUpdate={() => {
          const element = audio.current;
          if (!element) return;
          setTime(element.currentTime);
          if (Number.isFinite(element.duration) && element.duration > 0 && "mediaSession" in navigator) {
            try { navigator.mediaSession.setPositionState({ duration: element.duration, playbackRate: 1, position: Math.min(element.currentTime, element.duration) }); } catch { /* Optional browser support. */ }
          }
        }}
        onLoadedMetadata={() => setDuration(Number.isFinite(audio.current?.duration) ? audio.current!.duration : 0)}
        onError={() => {
          if (!currentRef.current || !ownsAudio) return;
          failed.current.add(currentRef.current.id);
          next();
        }}
      />
      {current && ownsAudio && pathname !== "/player" ? (
        <div className="sticky bottom-0 z-20 mx-auto flex max-w-[420px] items-center gap-3 border-t border-gold/40 bg-bg px-5 py-3">
          <Link href="/player" className="min-w-0 flex-1 truncate font-josefin text-[12px] text-gold">{current.title} · Vocals</Link>
          <button onClick={value.toggle} className="min-h-11 px-2 text-gold" aria-label={playing ? "Pause vocals" : "Play vocals"}>{playing ? "Pause" : "Play"}</button>
          <button onClick={next} className="min-h-11 px-2 text-gold" aria-label="Next song">Next</button>
        </div>
      ) : null}
    </Context.Provider>
  );
}

export function VocalPlayerScreen() {
  const player = useVocalPlayer();
  const label = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
  return (
    <main className="flex-1 px-5 py-6">
      <p className="font-josefin text-[10px] uppercase tracking-[0.16em] text-text-muted">Full songs · Only vocals</p>
      <h1 className="mt-3 font-playfair text-[28px] italic text-text">{player.current?.title ?? "Your vocals, nonstop."}</h1>
      <p className="mt-2 font-josefin text-[12px] text-text-muted">{player.current?.artist ?? `${player.tracks.length} songs in your library`}</p>
      {player.current ? (
        <div className="mt-6">
          <input type="range" min="0" max={player.duration || 1} step="0.1" value={Math.min(player.time, player.duration || 1)} onChange={(e) => player.seek(Number(e.target.value))} aria-label="Playback position" className="h-10 w-full accent-gold" />
          <div className="flex justify-between font-josefin text-[10px] tabular-nums text-text-muted"><span>{label(player.time)}</span><span>{label(player.duration)}</span></div>
        </div>
      ) : null}
      <div className="mt-6 grid grid-cols-[1fr_1.5fr_1fr] gap-2">
        <button disabled={!player.tracks.length} onClick={player.previous} aria-label="Previous song" className="min-h-14 border border-border-dark text-text-muted disabled:opacity-40">Previous</button>
        <button disabled={player.loading || !player.tracks.length} onClick={player.toggle} className="min-h-14 border border-gold bg-gold/10 text-gold disabled:opacity-40">{player.loading ? "Loading…" : player.playing ? "Pause" : "Play"}</button>
        <button disabled={!player.tracks.length} onClick={player.next} aria-label="Next song" className="min-h-14 border border-border-dark text-text-muted disabled:opacity-40">Next</button>
      </div>
      <button onClick={player.setShuffle} aria-pressed={player.shuffle} className={`mt-3 min-h-11 w-full font-josefin text-[11px] uppercase tracking-[0.12em] ${player.shuffle ? "text-gold" : "text-text-muted"}`}>Shuffle {player.shuffle ? "on" : "off"}</button>
      {player.error ? <p role="alert" className="mt-3 text-sm text-terracotta">{player.error} {!player.tracks.length ? <button onClick={() => void player.refresh()} className="underline">Retry</button> : null}</p> : null}
      {!player.loading && !player.tracks.length && !player.error ? <p className="mt-4 text-sm text-text-muted">Your completed songs will appear here. <Link href="/" className="text-gold underline">Add a song</Link></p> : null}
      <ol className="mt-6 divide-y divide-border-dark border-t border-border-dark" aria-label="Vocal songs">
        {player.tracks.map((track) => <li key={track.id}>
          <button onClick={() => player.start(track.id)} aria-current={player.current?.id === track.id ? "true" : undefined} className={`w-full py-4 text-left ${player.current?.id === track.id ? "text-gold" : "text-text"}`}>
            <span className="block font-playfair text-[18px] italic">{track.title}</span>
            <span className="mt-1 block font-josefin text-[10px] text-text-muted">{track.artist}</span>
          </button>
        </li>)}
      </ol>
    </main>
  );
}
