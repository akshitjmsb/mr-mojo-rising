"use client";

import { useEffect, useRef, useState } from "react";
import { lessonTime } from "@/lib/lesson-types";

type Player = {
  playVideo(): void; pauseVideo(): void; seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number; getPlayerState(): number; setPlaybackRate(rate: number): void;
  getAvailablePlaybackRates(): number[]; destroy(): void;
};
type YTAPI = { Player: new (element: HTMLElement, options: Record<string, unknown>) => Player };
declare global { interface Window { YT?: YTAPI; onYouTubeIframeAPIReady?: () => void } }
let loading: Promise<YTAPI> | undefined;
function youtubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  loading ??= new Promise<YTAPI>((resolve, reject) => {
    const timeout = setTimeout(() => { loading = undefined; reject(new Error("YouTube did not load.")); }, 15000);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); clearTimeout(timeout); if (window.YT) resolve(window.YT); };
    const script = document.createElement("script"); script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => { clearTimeout(timeout); loading = undefined; reject(new Error("YouTube could not load.")); };
    document.head.appendChild(script);
  });
  return loading;
}

export default function TeacherPlayer({ url, start, end }: { url: string; start: number | null; end: number | null }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const range = useRef({ start, end });
  const looping = useRef(false);
  const preferredRate = useRef(1);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [rate, setRate] = useState(1);
  const [rates, setRates] = useState<number[]>([1]);
  const [error, setError] = useState("");
  const videoId = new URL(url).searchParams.get("v") || "";
  useEffect(() => {
    let cancelled = false;
    const mount = document.createElement("div"); host.current?.appendChild(mount);
    youtubeAPI().then(api => {
      if (cancelled) return;
      player.current = new api.Player(mount, {
        width: "100%", height: 216, videoId,
        playerVars: { playsinline: 1, origin: window.location.origin, rel: 0 },
        events: {
          onReady: () => { if (cancelled) return; setReady(true); setRates(player.current?.getAvailablePlaybackRates() || [1]); player.current?.setPlaybackRate(preferredRate.current); if (range.current.start !== null) player.current?.seekTo(range.current.start, true); },
          onStateChange: (event: { data: number }) => { if (!cancelled) { setPlaying(event.data === 1); if (event.data === 1) player.current?.setPlaybackRate(preferredRate.current); } },
          onPlaybackRateChange: (event: { data: number }) => { if (!cancelled) setRate(event.data); },
          onError: () => { if (!cancelled) { setError("Open this lesson on YouTube to hear the teacher."); setReady(false); } },
          onAutoplayBlocked: () => { if (!cancelled) setError("Tap play in the video to enable sound."); },
        },
      });
    }).catch(() => { if (!cancelled) setError("Open this lesson on YouTube to hear the teacher."); });
    return () => { cancelled = true; player.current?.destroy(); player.current = null; mount.remove(); };
  }, [videoId]);
  useEffect(() => {
    range.current = { start, end };
    if (ready && player.current) { player.current.pauseVideo(); if (start !== null) player.current.seekTo(start, true); }
  }, [start, end, ready]);
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => {
      const p = player.current, r = range.current;
      if (!p || r.start === null || r.end === null || p.getPlayerState() !== 1) return;
      if (p.getCurrentTime() >= r.end) {
        if (looping.current) p.seekTo(r.start, true); else p.pauseVideo();
      }
    }, 100);
    return () => clearInterval(timer);
  }, [ready]);
  function play() {
    const p = player.current; if (!p) return;
    if (playing) { p.pauseVideo(); return; }
    if (start !== null && (p.getCurrentTime() < start || (end !== null && p.getCurrentTime() >= end))) p.seekTo(start, true);
    setError(""); p.playVideo();
  }
  return <section className="mt-5 space-y-3" aria-label="Teacher playback">
    <div className="flex gap-2"><button onClick={play} disabled={!ready} className="min-h-12 flex-1 rounded-xl bg-gold font-semibold text-bg disabled:opacity-40">{playing ? "Ⅱ Pause" : "▶ Hear the teacher"}</button><button disabled={!ready || start === null || end === null} aria-pressed={loop} onClick={() => { looping.current = !loop; setLoop(!loop); }} className={`min-h-12 rounded-xl border px-4 disabled:opacity-40 ${loop ? "border-gold text-gold" : "border-border text-text-muted"}`}>↻ Loop</button></div>
    <div className="flex items-center justify-between text-xs text-text-muted"><span>{start === null ? "Full lesson" : `${lessonTime(start)}${end === null ? "" : `–${lessonTime(end)}`}`}</span><div className="flex gap-1">{[.5, .75, 1].map(speed => <button key={speed} disabled={!ready || !rates.includes(speed)} aria-pressed={speed === rate} onClick={() => { preferredRate.current = speed; player.current?.setPlaybackRate(speed); }} className={`min-h-10 min-w-12 rounded-lg disabled:opacity-30 ${speed === rate ? "bg-input-bg text-gold" : ""}`}>{speed * 100}%</button>)}</div></div>
    <div ref={host} className="min-h-[216px] overflow-hidden rounded-xl border border-border-darkest bg-input-bg" />
    {error && <p role="status" className="text-xs text-terracotta">{error}</p>}
    <a href={`${url}${start === null ? "" : `&t=${Math.floor(start)}s`}`} target="_blank" rel="noreferrer" className="block py-2 text-xs text-text-muted underline">Watch on YouTube ↗</a>
  </section>;
}
